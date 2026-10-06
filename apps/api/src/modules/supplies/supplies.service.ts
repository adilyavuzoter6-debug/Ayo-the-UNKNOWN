import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { ReceiveSupplyDto, TransferSupplyDto, CreateSupplyItemDto } from "./dto/supply.dto";

/** Rounding to the stored precision (3 decimals) so sums of decimal quantities compare exactly. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface MovementLike {
  itemId: string;
  kind: "RECEIVED" | "TRANSFER";
  quantity: unknown;
  fromFarmId: string | null;
  toFarmId: string | null;
}

/** Quantity each farm holds, from a list of movements. Only the movements passed in are counted. */
function balancesByFarm(movements: MovementLike[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (farmId: string | null, delta: number) => {
    if (!farmId) return; // the farm was removed; its stock is no longer shown anywhere
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

@Injectable()
export class SuppliesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
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

  /** Every item, with how much of it each farm holds. Farms with nothing in them are left out. */
  async list(companyId: string) {
    const client = this.tenantPrisma.forTenant(companyId);
    const [items, movements, farms] = await Promise.all([
      client.supplyItem.findMany({ orderBy: { name: "asc" } }),
      client.supplyMovement.findMany(),
      client.farm.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    ]);
    const farmName = new Map(farms.map((f) => [f.id, f.name]));

    return items.map((item) => {
      const balances = balancesByFarm(movements.filter((m) => m.itemId === item.id));
      const rows = [...balances.entries()]
        .filter(([, quantity]) => quantity !== 0)
        .map(([farmId, quantity]) => ({ farmId, farmName: farmName.get(farmId) ?? null, quantity }))
        .sort((a, b) => (a.farmName ?? "").localeCompare(b.farmName ?? "", "tr"));
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

  /** A quantity that arrived at a farm. */
  async receive(companyId: string, userId: string, itemId: string, dto: ReceiveSupplyDto) {
    await this.assertItem(companyId, itemId);
    await this.assertFarm(companyId, dto.farmId);
    const movement = await this.tenantPrisma.forTenant(companyId).supplyMovement.create({
      data: {
        companyId,
        itemId,
        kind: "RECEIVED",
        quantity: round3(dto.quantity),
        toFarmId: dto.farmId,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
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

    const movements = await this.tenantPrisma.forTenant(companyId).supplyMovement.findMany({ where: { itemId } });
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
}
