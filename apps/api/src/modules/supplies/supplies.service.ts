import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CostCategory } from "@prisma/client";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { ExchangeRatesService, roundRate, type ExchangeCurrency } from "../exchange-rates/exchange-rates.service";
import type {
  CreateSupplyItemDto,
  ReceiveSupplyDto,
  TransferSupplyDto,
  UpdateSupplyMovementDto,
} from "./dto/supply.dto";

/** Rounding to the stored precision (3 decimals) so sums of decimal quantities compare exactly. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface MovementLike {
  id?: string;
  itemId: string;
  kind: "RECEIVED" | "TRANSFER" | "CONSUMED";
  quantity: unknown;
  fromFarmId: string | null;
  toFarmId: string | null;
}

/** Quantity each farm holds, from a list of movements. A farm whose row was hard-deleted (the
 *  only way fromFarmId/toFarmId end up null) is left out; its stock is no longer shown anywhere. */
function balancesByFarm(movements: MovementLike[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (farmId: string | null, delta: number) => {
    if (!farmId) return;
    balances.set(farmId, round3((balances.get(farmId) ?? 0) + delta));
  };
  for (const m of movements) {
    const q = Number(m.quantity);
    if (m.kind === "RECEIVED") {
      add(m.toFarmId, q);
    } else {
      add(m.fromFarmId, -q);
      add(m.toFarmId, q);
    }
  }
  return balances;
}

/** Refused when any farm would hold less than nothing. */
function assertNoNegative(movements: MovementLike[], unit: string) {
  for (const quantity of balancesByFarm(movements).values()) {
    if (quantity < 0) {
      throw new BadRequestException(
        `Bu değişiklik sonrası bir çiftlikte stok ${quantity} ${unit} olur; kayıt yapılmadı.`,
      );
    }
  }
}

/** MEDICINE/VACCINATION cost entries read correctly in the Maliyetler page; anything else not
 *  recognizably medical (pipes, nets, filters, ...) is just OTHER. */
function costCategoryFor(itemCategory: string): CostCategory {
  const normalized = itemCategory.trim().toLocaleLowerCase("tr");
  if (normalized.includes("aşı") || normalized.includes("asi") || normalized.includes("vaccin")) {
    return "VACCINATION";
  }
  if (normalized.includes("ilaç") || normalized.includes("ilac") || normalized.includes("medic")) {
    return "MEDICINE";
  }
  return "OTHER";
}

/**
 * Groups farms that share one physical depot (Farm.sharesDepotWithFarmId) using union-find, so a
 * linked pair (or chain) reports and pools its stock as a single place instead of two unrelated
 * farm rows. A farm with no link of its own, and nobody else's, is its own group of one.
 */
function groupSharedFarms(farms: { id: string; sharesDepotWithFarmId: string | null }[]): Map<string, string[]> {
  const parent = new Map<string, string>(farms.map((f) => [f.id, f.id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const f of farms) {
    if (f.sharesDepotWithFarmId && parent.has(f.sharesDepotWithFarmId)) {
      union(f.id, f.sharesDepotWithFarmId);
    }
  }
  const groups = new Map<string, string[]>();
  for (const f of farms) {
    const root = find(f.id);
    const members = groups.get(root) ?? [];
    members.push(f.id);
    groups.set(root, members);
  }
  return groups;
}

@Injectable()
export class SuppliesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  private async assertFarm(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
  }

  private async assertItem(companyId: string, itemId: string) {
    const item = await this.tenantPrisma.forTenant(companyId).supplyItem.findFirst({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Supply item not found.");
    }
    return item;
  }

  /** Live (not deleted) movements of one item. */
  private async itemMovements(companyId: string, itemId: string) {
    return this.tenantPrisma.forTenant(companyId).supplyMovement.findMany({
      where: { itemId, deletedAt: null },
      orderBy: { occurredAt: "asc" },
    });
  }

  /**
   * The farm ids that pool stock with `farmId` — itself, plus every farm reachable through
   * Farm.sharesDepotWithFarmId links (in either direction, one hop is enough for the pairs this
   * exists for, but it's resolved generally in case a chain ever grows past a pair).
   */
  private async depotGroup(companyId: string, farmId: string): Promise<string[]> {
    const client = this.tenantPrisma.forTenant(companyId);
    const [self, linkedToMe] = await Promise.all([
      client.farm.findFirst({ where: { id: farmId }, select: { sharesDepotWithFarmId: true } }),
      client.farm.findMany({ where: { sharesDepotWithFarmId: farmId }, select: { id: true } }),
    ]);
    const ids = new Set<string>([farmId, ...linkedToMe.map((f) => f.id)]);
    if (self?.sharesDepotWithFarmId) ids.add(self.sharesDepotWithFarmId);
    return [...ids];
  }

  /** Every item, with how much of it each depot group (one or more farms sharing a physical
   *  store) holds. Empty rows are left out. */
  async list(companyId: string) {
    const client = this.tenantPrisma.forTenant(companyId);
    const [items, movements, farms] = await Promise.all([
      client.supplyItem.findMany({ orderBy: { name: "asc" } }),
      client.supplyMovement.findMany({ where: { deletedAt: null } }),
      client.farm.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, sharesDepotWithFarmId: true },
      }),
    ]);
    const farmName = new Map(farms.map((f) => [f.id, f.name]));
    const groups = [...groupSharedFarms(farms).values()];

    return items.map((item) => {
      const perFarm = balancesByFarm(movements.filter((m) => m.itemId === item.id));
      const rows = groups
        .map((members) => ({
          farmIds: members,
          farmName: members.map((id) => farmName.get(id) ?? "Silinmiş çiftlik").join(" + "),
          quantity: round3(members.reduce((sum, id) => sum + (perFarm.get(id) ?? 0), 0)),
        }))
        .filter((r) => r.quantity !== 0)
        .sort((a, b) => a.farmName.localeCompare(b.farmName, "tr"));
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        totalQuantity: round3(rows.reduce((sum, r) => sum + r.quantity, 0)),
        balances: rows,
      };
    });
  }

  /** The item's live movements, newest first, with farm names (and price, when set) for the page. */
  async listMovements(companyId: string, itemId: string) {
    await this.assertItem(companyId, itemId);
    const [movements, farms] = await Promise.all([
      this.itemMovements(companyId, itemId),
      this.tenantPrisma.forTenant(companyId).farm.findMany({ select: { id: true, name: true } }),
    ]);
    const farmName = new Map(farms.map((f) => [f.id, f.name]));
    return movements
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        quantity: Number(m.quantity),
        fromFarmId: m.fromFarmId,
        fromFarmName: m.fromFarmId ? (farmName.get(m.fromFarmId) ?? null) : null,
        toFarmId: m.toFarmId,
        toFarmName: m.toFarmId ? (farmName.get(m.toFarmId) ?? null) : null,
        unitPriceTry: m.unitPriceTry ? Number(m.unitPriceTry) : null,
        occurredAt: m.occurredAt,
        note: m.note,
      }))
      .reverse();
  }

  async createItem(companyId: string, userId: string, dto: CreateSupplyItemDto) {
    const item = await this.tenantPrisma.forTenant(companyId).supplyItem.create({
      data: {
        companyId,
        name: dto.name.trim(),
        category: dto.category.trim(),
        unit: dto.unit.trim(),
        createdById: userId,
      },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "SupplyItem",
      entityId: item.id,
      newValue: { name: item.name, category: item.category, unit: item.unit },
    });
    return item;
  }

  /** A quantity that arrived at a farm. If priced, also books a MEDICINE/VACCINATION/OTHER cost
   *  entry (see costCategoryFor). */
  async receive(companyId: string, userId: string, itemId: string, dto: ReceiveSupplyDto) {
    const item = await this.assertItem(companyId, itemId);
    await this.assertFarm(companyId, dto.farmId);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const currency: ExchangeCurrency = dto.unitPriceCurrency ?? "TRY";
    const rate =
      dto.unitPriceAmount === undefined
        ? undefined
        : await this.exchangeRates.resolveTryRate(currency, occurredAt, dto.exchangeRate);
    const unitPriceTry = dto.unitPriceAmount === undefined || rate === undefined ? undefined : roundRate(dto.unitPriceAmount * rate);

    const movement = await this.tenantPrisma.forTenant(companyId).supplyMovement.create({
      data: {
        companyId,
        itemId,
        kind: "RECEIVED",
        quantity: round3(dto.quantity),
        toFarmId: dto.farmId,
        unitPriceTry,
        occurredAt,
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });

    if (dto.unitPriceAmount !== undefined && rate !== undefined) {
      const amount = Math.round(dto.unitPriceAmount * dto.quantity * 100) / 100;
      await this.tenantPrisma.forTenant(companyId).costEntry.create({
        data: {
          companyId,
          farmId: dto.farmId,
          category: costCategoryFor(item.category),
          amount,
          currency,
          exchangeRate: rate,
          amountTry: Math.round(amount * rate * 100) / 100,
          incurredAt: occurredAt,
          sourceType: "SupplyMovement",
          sourceId: movement.id,
          createdById: userId,
          notes: `${item.name}: ${dto.quantity} ${item.unit} × ${dto.unitPriceAmount} ${currency}/${item.unit} (auto)`,
        },
      });
    }

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "SupplyMovement",
      entityId: movement.id,
      newValue: { itemId, kind: "RECEIVED", quantity: movement.quantity.toString(), toFarmId: dto.farmId },
    });
    return movement;
  }

  /** Moves a quantity from one farm to another. Refused when the source farm does not hold that much. */
  async transfer(companyId: string, userId: string, itemId: string, dto: TransferSupplyDto) {
    await this.assertItem(companyId, itemId);
    if (dto.fromFarmId === dto.toFarmId) {
      throw new BadRequestException("Kaynak ve hedef çiftlik farklı olmalı.");
    }
    await this.assertFarm(companyId, dto.fromFarmId);
    await this.assertFarm(companyId, dto.toFarmId);

    const movements = await this.itemMovements(companyId, itemId);
    const available = balancesByFarm(movements).get(dto.fromFarmId) ?? 0;
    if (dto.quantity > available) {
      throw new BadRequestException(`Kaynak çiftlikte yalnızca ${available} birim var.`);
    }

    const movement = await this.tenantPrisma.forTenant(companyId).supplyMovement.create({
      data: {
        companyId,
        itemId,
        kind: "TRANSFER",
        quantity: round3(dto.quantity),
        fromFarmId: dto.fromFarmId,
        toFarmId: dto.toFarmId,
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "SupplyMovement",
      entityId: movement.id,
      newValue: {
        itemId,
        kind: "TRANSFER",
        quantity: movement.quantity.toString(),
        fromFarmId: dto.fromFarmId,
        toFarmId: dto.toFarmId,
      },
    });
    return movement;
  }

  /**
   * Draws a quantity out of stock by use rather than moving it to another farm — e.g. a liquid
   * medicine dose recorded against a treatment. `input.farmId` is the tank's own farm; when that
   * farm's own balance isn't enough but a farm it shares a depot with (Farm.sharesDepotWithFarmId)
   * alone covers it, it's drawn from there instead. Refused when no single farm in the group, by
   * itself, covers the amount — farms outside the group are never considered.
   */
  async consume(
    companyId: string,
    userId: string,
    itemId: string,
    input: { farmId: string; quantity: number; occurredAt?: Date; note?: string },
  ) {
    const item = await this.assertItem(companyId, itemId);
    await this.assertFarm(companyId, input.farmId);

    const group = await this.depotGroup(companyId, input.farmId);
    const movements = await this.itemMovements(companyId, itemId);
    const balances = balancesByFarm(movements);

    const own = balances.get(input.farmId) ?? 0;
    let fromFarmId: string;
    if (input.quantity <= own) {
      fromFarmId = input.farmId;
    } else {
      const partner = group.find((id) => id !== input.farmId && (balances.get(id) ?? 0) >= input.quantity);
      if (!partner) {
        const combined = round3(group.reduce((sum, id) => sum + (balances.get(id) ?? 0), 0));
        const farms = await this.tenantPrisma
          .forTenant(companyId)
          .farm.findMany({ where: { id: { in: group } }, select: { name: true } });
        const label = farms.map((f) => f.name).join(" + ");
        throw new BadRequestException(`"${item.name}" stoğundan (${label}) yalnızca ${combined} ${item.unit} var.`);
      }
      fromFarmId = partner;
    }

    const movement = await this.tenantPrisma.forTenant(companyId).supplyMovement.create({
      data: {
        companyId,
        itemId,
        kind: "CONSUMED",
        quantity: round3(input.quantity),
        fromFarmId,
        occurredAt: input.occurredAt ?? new Date(),
        note: input.note?.trim() || null,
        createdById: userId,
      },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "SupplyMovement",
      entityId: movement.id,
      newValue: { itemId, kind: "CONSUMED", quantity: movement.quantity.toString(), fromFarmId },
    });
    return movement;
  }

  private async findMovement(companyId: string, movementId: string) {
    const movement = await this.tenantPrisma.forTenant(companyId).supplyMovement.findFirst({
      where: { id: movementId, deletedAt: null },
    });
    if (!movement) {
      throw new NotFoundException("Supply movement not found.");
    }
    return movement;
  }

  /**
   * Corrects a movement's quantity, note, or (for a RECEIVED movement) its price. A quantity change
   * is checked against every farm's balance as it would be after the change, so a correction cannot
   * leave any farm with negative stock. A price correction re-prices the movement's auto-derived
   * cost entry at the movement's own date, same as feed inventory's lot pricing.
   */
  async updateMovement(companyId: string, userId: string, movementId: string, dto: UpdateSupplyMovementDto) {
    const current = await this.findMovement(companyId, movementId);
    const item = await this.assertItem(companyId, current.itemId);
    const quantity = dto.quantity !== undefined ? round3(dto.quantity) : Number(current.quantity);

    if (dto.quantity !== undefined) {
      const others = (await this.itemMovements(companyId, item.id)).filter((m) => m.id !== movementId);
      const after = [...others, { ...current, quantity }];
      assertNoNegative(after, item.unit);
    }

    if (dto.unitPriceAmount !== undefined) {
      if (current.kind !== "RECEIVED") {
        throw new BadRequestException("Yalnızca gelen stok hareketlerinin fiyatı girilebilir.");
      }
      const client = this.tenantPrisma.forTenant(companyId);
      const currency: ExchangeCurrency = dto.unitPriceCurrency ?? "TRY";
      const rate = await this.exchangeRates.resolveTryRate(currency, current.occurredAt, dto.exchangeRate);
      const unitPriceTry = roundRate(dto.unitPriceAmount * rate);
      const amount = Math.round(dto.unitPriceAmount * quantity * 100) / 100;
      const amountTry = Math.round(amount * rate * 100) / 100;
      const notes = `${item.name}: ${quantity} ${item.unit} × ${dto.unitPriceAmount} ${currency}/${item.unit} (düzeltildi)`;

      const existingCost = await client.costEntry.findFirst({
        where: { sourceType: "SupplyMovement", sourceId: movementId },
      });
      if (existingCost) {
        await client.costEntry.update({
          where: { id: existingCost.id },
          data: { amount, currency, exchangeRate: rate, amountTry, notes },
        });
      } else {
        await client.costEntry.create({
          data: {
            companyId,
            farmId: current.toFarmId,
            category: costCategoryFor(item.category),
            amount,
            currency,
            exchangeRate: rate,
            amountTry,
            incurredAt: current.occurredAt,
            sourceType: "SupplyMovement",
            sourceId: movementId,
            createdById: userId,
            notes,
          },
        });
      }
      await client.supplyMovement.update({ where: { id: movementId }, data: { unitPriceTry } });
    }

    const updated = await this.tenantPrisma.forTenant(companyId).supplyMovement.update({
      where: { id: movementId },
      data: {
        quantity,
        note: dto.note !== undefined ? dto.note.trim() || null : current.note,
      },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "SupplyMovement",
      entityId: movementId,
      previousValue: { quantity: current.quantity.toString(), note: current.note },
      newValue: { quantity: updated.quantity.toString(), note: updated.note },
    });
    return updated;
  }

  /** Removes a movement (and any cost entry it booked) from the stock. Refused if it would leave
   *  any farm with negative stock. */
  async removeMovement(companyId: string, userId: string, movementId: string) {
    const current = await this.findMovement(companyId, movementId);
    const item = await this.assertItem(companyId, current.itemId);
    const others = (await this.itemMovements(companyId, item.id)).filter((m) => m.id !== movementId);
    assertNoNegative(others, item.unit);

    const client = this.tenantPrisma.forTenant(companyId);
    await client.costEntry.deleteMany({ where: { sourceType: "SupplyMovement", sourceId: movementId } });
    await client.supplyMovement.update({
      where: { id: movementId },
      data: { deletedAt: new Date() },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "SupplyMovement",
      entityId: movementId,
      previousValue: { kind: current.kind, quantity: current.quantity.toString() },
    });
    return { deleted: true as const };
  }
}
