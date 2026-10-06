import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { ExchangeCurrency, ExchangeRatesService } from "../exchange-rates/exchange-rates.service";

export type StockingSourceKind = "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";

export interface StockingInput {
  source?: StockingSourceKind;
  fishCount: number;
  eggCount?: number;
  /** Per fish (fingerlings) or per egg (eggs), in `currency`. */
  unitPrice?: number;
  currency?: ExchangeCurrency;
  exchangeRate?: number;
}

export interface PreparedStockingCost {
  category: "FINGERLINGS" | "EGGS";
  amount: number;
  currency: ExchangeCurrency;
  exchangeRate: number;
  amountTry: number;
  notes: string;
}

/** Only the stocking-cost rows carry this source type; transfers between batches use BatchTransfer. */
export const STOCKING_SOURCE = "FishBatchStocking";
export const TRANSFER_SOURCE = "BatchTransfer";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a stocking must say for its price to make sense. Checked before anything is written, so a
 * batch never ends up half-recorded (batch without its cost, or a cost against the wrong count).
 */
export function validateStockingInput(input: StockingInput): void {
  const { source, unitPrice, eggCount } = input;
  if (!source) {
    if (unitPrice !== undefined || eggCount !== undefined || input.currency !== undefined) {
      throw new BadRequestException("Stoklama fiyatı için önce yavru mu yumurta mı olduğunu seçin.");
    }
    return;
  }
  if (source === "FINGERLINGS_PURCHASED") {
    if (unitPrice === undefined) throw new BadRequestException("Yavru adet fiyatını girin.");
    if (eggCount !== undefined) throw new BadRequestException("Yavru alımında yumurta adedi girilmez.");
    return;
  }
  if (eggCount === undefined) throw new BadRequestException("Yumurta adedini girin.");
  if (source === "EGGS_PURCHASED" && unitPrice === undefined) {
    throw new BadRequestException("Satın alınan yumurtanın adet fiyatını girin.");
  }
  // EGGS_IN_HOUSE: the eggs are our own; a unit price is optional (an internal cost we choose to book).
}

@Injectable()
export class StockingCostService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /**
   * Resolves the price and its exchange rate for a stocking, before any write. Returns null when no
   * cost applies (no source, or our own eggs with no internal cost).
   */
  async prepare(input: StockingInput, incurredAt: Date): Promise<PreparedStockingCost | null> {
    validateStockingInput(input);
    if (!input.source || input.unitPrice === undefined) return null;

    const isFingerling = input.source === "FINGERLINGS_PURCHASED";
    const count = isFingerling ? input.fishCount : (input.eggCount ?? 0);
    const currency = input.currency ?? "TRY";
    const exchangeRate = await this.exchangeRates.resolveTryRate(currency, incurredAt, input.exchangeRate);
    const amount = round2(count * input.unitPrice);

    return {
      category: isFingerling ? "FINGERLINGS" : "EGGS",
      amount,
      currency,
      exchangeRate,
      amountTry: round2(amount * exchangeRate),
      notes: `${count.toLocaleString("tr")} ${isFingerling ? "yavru" : "yumurta"} × ${input.unitPrice} ${currency}`,
    };
  }

  /** Writes the stocking cost against the batch, dated the day it entered the farm. */
  async book(
    companyId: string,
    userId: string,
    args: { batchId: string; tankId: string; incurredAt: Date; prepared: PreparedStockingCost },
  ) {
    const client = this.tenantPrisma.forTenant(companyId);
    const tank = await client.tank.findFirst({
      where: { id: args.tankId, deletedAt: null },
      include: { farmSection: true },
    });
    if (!tank) {
      throw new NotFoundException("Tank not found.");
    }

    const { prepared } = args;
    return client.costEntry.create({
      data: {
        companyId,
        farmId: tank.farmSection.farmId,
        batchId: args.batchId,
        category: prepared.category,
        amount: prepared.amount,
        currency: prepared.currency,
        exchangeRate: prepared.exchangeRate,
        amountTry: prepared.amountTry,
        incurredAt: args.incurredAt,
        sourceType: STOCKING_SOURCE,
        sourceId: args.batchId,
        createdById: userId,
        notes: prepared.notes,
      },
    });
  }

  /**
   * Replaces a batch's stocking cost after its price was corrected. Refused once the batch has been
   * split or merged: its cost has already been divided between batches, and changing the total would
   * leave those shares wrong.
   */
  async replace(
    companyId: string,
    userId: string,
    args: { batchId: string; farmEntryDate: Date; prepared: PreparedStockingCost | null },
  ): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);
    const transfers = await client.costEntry.count({
      where: { batchId: args.batchId, sourceType: TRANSFER_SOURCE },
    });
    if (transfers > 0) {
      throw new ConflictException(
        "Bölünmüş ya da birleştirilmiş partinin stoklama fiyatı değiştirilemez; maliyet zaten partiler arasında dağıtıldı.",
      );
    }

    if (!args.prepared) {
      await client.costEntry.deleteMany({ where: { batchId: args.batchId, sourceType: STOCKING_SOURCE } });
      return;
    }

    const { prepared } = args;
    const updated = await client.costEntry.updateMany({
      where: { batchId: args.batchId, sourceType: STOCKING_SOURCE },
      data: {
        category: prepared.category,
        amount: prepared.amount,
        currency: prepared.currency,
        exchangeRate: prepared.exchangeRate,
        amountTry: prepared.amountTry,
        notes: prepared.notes,
      },
    });
    if (updated.count > 0) return;

    // No cost was booked before (the batch was stocked without a price): book it now, against the tank
    // it was first stocked into.
    const stocking = await client.batchMovement.findFirst({
      where: { batchId: args.batchId, movementType: "STOCKING" },
      orderBy: { occurredAt: "asc" },
    });
    if (!stocking?.toTankId) {
      throw new NotFoundException("Stocking movement not found for this batch.");
    }
    await this.book(companyId, userId, {
      batchId: args.batchId,
      tankId: stocking.toTankId,
      incurredAt: args.farmEntryDate,
      prepared,
    });
  }

  /**
   * Moves `fraction` of a batch's stocking cost to another batch — when fish are split off or merged
   * in. Stocking cost follows the fish, so a 40% split takes 40% of what the parent's fish cost. Written
   * as a pair of TRY rows (−/+) dated when the cost was incurred, so the farm total is unchanged and
   * each batch carries what its fish cost.
   */
  async transfer(
    companyId: string,
    userId: string,
    args: { fromBatchId: string; toBatchId: string; fraction: number; reference: string },
  ): Promise<void> {
    if (args.fraction <= 0) return;
    const client = this.tenantPrisma.forTenant(companyId);
    const costs = await client.costEntry.findMany({
      where: { batchId: args.fromBatchId, sourceType: { in: [STOCKING_SOURCE, TRANSFER_SOURCE] } },
      orderBy: { incurredAt: "asc" },
    });
    if (costs.length === 0) return;

    const netTry = costs.reduce((sum, c) => sum + Number(c.amountTry), 0);
    const moveTry = round2(netTry * Math.min(args.fraction, 1));
    if (moveTry === 0) return;

    const first = costs[0]!;
    const shared = {
      companyId,
      farmId: first.farmId,
      category: first.category,
      currency: "TRY",
      exchangeRate: 1,
      incurredAt: first.incurredAt,
      createdById: userId,
    };
    await client.costEntry.create({
      data: {
        ...shared,
        batchId: args.fromBatchId,
        amount: -moveTry,
        amountTry: -moveTry,
        sourceType: TRANSFER_SOURCE,
        sourceId: `${args.reference}:out`,
        notes: `${(args.fraction * 100).toFixed(1)}% stoklama maliyeti aktarıldı`,
      },
    });
    await client.costEntry.create({
      data: {
        ...shared,
        batchId: args.toBatchId,
        amount: moveTry,
        amountTry: moveTry,
        sourceType: TRANSFER_SOURCE,
        sourceId: `${args.reference}:in`,
        notes: `${(args.fraction * 100).toFixed(1)}% stoklama maliyeti aktarıldı`,
      },
    });
  }
}
