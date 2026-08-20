import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateCostEntryDto } from "./dto/create-cost-entry.dto";

@Injectable()
export class CostsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
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

  async create(companyId: string, farmId: string, userId: string, dto: CreateCostEntryDto) {
    await this.assertFarmInTenant(companyId, farmId);

    const entry = await this.tenantPrisma.forTenant(companyId).costEntry.create({
      data: {
        companyId,
        farmId,
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency ?? "TRY",
        tankId: dto.tankId,
        batchId: dto.batchId,
        incurredAt: new Date(dto.incurredAt),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "CostEntry",
      entityId: entry.id,
      newValue: { farmId, category: dto.category, amount: dto.amount },
    });

    return entry;
  }

  async listForFarm(companyId: string, farmId: string, batchId?: string) {
    await this.assertFarmInTenant(companyId, farmId);

    return this.tenantPrisma.forTenant(companyId).costEntry.findMany({
      where: { farmId, ...(batchId ? { batchId } : {}) },
      orderBy: { incurredAt: "desc" },
    });
  }

  /**
   * Total cost by category for the period, plus a per-batch "direct cost/kg" breakdown — direct
   * meaning only costs explicitly tagged with that batchId (feed, medicine — the categories that
   * are naturally attributable to one batch), divided by that batch's ACTUAL-harvested biomass
   * in the same period. Farm-level costs (electricity, labor, overhead) are included in the
   * category totals but deliberately NOT allocated across batches — doing that accurately needs
   * a real allocation methodology (by biomass-share, by tank-time, etc.) this MVP doesn't
   * attempt, so "direct cost/kg" is reported as exactly what it is rather than implying a
   * fully-loaded cost the number doesn't actually represent.
   */
  async getCostSummary(companyId: string, farmId: string, periodStart: Date, periodEnd: Date) {
    await this.assertFarmInTenant(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);

    const entries = await client.costEntry.findMany({
      where: { farmId, incurredAt: { gte: periodStart, lte: periodEnd } },
    });

    const byCategory: Record<string, number> = {};
    let totalAmount = 0;
    for (const entry of entries) {
      const amount = Number(entry.amount);
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + amount;
      totalAmount += amount;
    }

    const batchIds = [...new Set(entries.map((e) => e.batchId).filter((id): id is string => id !== null))];
    const batchBreakdown = await Promise.all(
      batchIds.map(async (batchId) => {
        const directCostTotal = entries
          .filter((e) => e.batchId === batchId)
          .reduce((sum, e) => sum + Number(e.amount), 0);

        const [harvests, batch] = await Promise.all([
          client.harvestRecord.findMany({
            where: { batchId, type: "ACTUAL", harvestedAt: { gte: periodStart, lte: periodEnd } },
          }),
          client.fishBatch.findFirst({ where: { id: batchId } }),
        ]);
        const harvestedKg = harvests.reduce((sum, h) => sum + Number(h.biomassKg ?? 0), 0);

        return {
          batchId,
          lotCode: batch?.lotCode ?? batchId,
          directCostTotal,
          harvestedKg,
          directCostPerKg: harvestedKg > 0 ? directCostTotal / harvestedKg : null,
        };
      }),
    );

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalAmount,
      byCategory,
      batchBreakdown,
    };
  }
}
