import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { ExchangeCurrency, ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import type { CreateRecurringCostDto } from "./dto/create-recurring-cost.dto";
import { pendingOccurrences } from "./recurring-schedule";

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class RecurringCostsService {
  private readonly logger = new Logger(RecurringCostsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  private async assertFarmInTenant(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    return farm;
  }

  async listForFarm(companyId: string, farmId: string) {
    await this.assertFarmInTenant(companyId, farmId);
    return this.tenantPrisma.forTenant(companyId).recurringCost.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(companyId: string, farmId: string, userId: string, dto: CreateRecurringCostDto) {
    await this.assertFarmInTenant(companyId, farmId);
    const currency = dto.currency ?? "TRY";

    const recurring = await this.tenantPrisma.forTenant(companyId).recurringCost.create({
      data: {
        companyId,
        farmId,
        category: dto.category,
        amount: dto.amount,
        currency,
        dayOfMonth: dto.dayOfMonth,
        startDate: new Date(dto.startDate),
        notes: dto.notes,
        createdById: userId,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "RecurringCost",
      entityId: recurring.id,
      newValue: { farmId, category: dto.category, amount: dto.amount, currency, dayOfMonth: dto.dayOfMonth },
    });

    // Book any occurrence already due (e.g. a rent that started on the 1st, entered on the 6th).
    await this.materialize(companyId, farmId);
    return recurring;
  }

  /**
   * Stops future occurrences. Entries already written stay — they're real costs that happened, and
   * deleting history to fix a schedule would silently change past totals.
   */
  async stop(companyId: string, farmId: string, userId: string, id: string) {
    await this.assertFarmInTenant(companyId, farmId);
    const result = await this.tenantPrisma.forTenant(companyId).recurringCost.updateMany({
      where: { id, farmId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Recurring cost not found.");
    }

    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "RecurringCost",
      entityId: id,
      newValue: { farmId, stopped: true },
    });
  }

  /**
   * Writes every due-and-missing occurrence of this farm's recurring costs as a CostEntry. Runs on
   * read, so no scheduler is needed; it's idempotent (the (companyId, sourceType, sourceId) unique key
   * skips a month already booked by a concurrent read) and it stops at the first failure — a USD rate
   * the Central Bank couldn't supply — so the next read retries from exactly that month.
   */
  async materialize(companyId: string, farmId: string, today = new Date()): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);
    const rows = await client.recurringCost.findMany({ where: { farmId, deletedAt: null } });

    for (const row of rows) {
      const pending = pendingOccurrences({
        startDate: row.startDate,
        dayOfMonth: row.dayOfMonth,
        generatedThrough: row.generatedThrough,
        today,
      });
      if (pending.length === 0) continue;

      const currency = row.currency as ExchangeCurrency;
      let through = row.generatedThrough;
      for (const occurrence of pending) {
        let exchangeRate: number;
        try {
          exchangeRate = await this.exchangeRates.resolveTryRate(currency, occurrence.date);
        } catch (error) {
          this.logger.warn(`Recurring cost ${row.id} stopped at ${occurrence.month}: ${String(error)}`);
          break;
        }

        await client.costEntry.createMany({
          data: [
            {
              companyId,
              farmId,
              category: row.category,
              amount: row.amount,
              currency,
              exchangeRate,
              amountTry: round2(Number(row.amount) * exchangeRate),
              incurredAt: occurrence.date,
              sourceType: "RecurringCost",
              sourceId: `${row.id}:${occurrence.month}`,
              createdById: row.createdById,
              notes: row.notes ?? "Tekrarlayan gider",
            },
          ],
          skipDuplicates: true,
        });
        through = occurrence.month;
      }

      if (through !== row.generatedThrough) {
        await client.recurringCost.updateMany({
          where: { id: row.id, companyId },
          data: { generatedThrough: through },
        });
      }
    }
  }
}
