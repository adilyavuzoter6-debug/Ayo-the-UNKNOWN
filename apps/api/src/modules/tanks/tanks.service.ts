import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { naturalSortByCode } from "../../common/utils/natural-sort";
import type { CreateTankDto } from "./dto/create-tank.dto";
import type { UpdateTankDto } from "./dto/update-tank.dto";

@Injectable()
export class TanksService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertSectionInTenant(companyId: string, farmSectionId: string) {
    const section = await this.tenantPrisma
      .forTenant(companyId)
      .farmSection.findFirst({ where: { id: farmSectionId, deletedAt: null } });
    if (!section) {
      throw new NotFoundException("Farm section not found.");
    }
    return section;
  }

  async create(
    companyId: string,
    farmSectionId: string,
    userId: string,
    dto: CreateTankDto,
  ) {
    await this.assertSectionInTenant(companyId, farmSectionId);

    const tank = await this.tenantPrisma.forTenant(companyId).tank.create({
      data: {
        companyId,
        farmSectionId,
        code: dto.code.toUpperCase(),
        type: dto.type,
        volumeM3: dto.volumeM3,
        maxBiomassKg: dto.maxBiomassKg,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "Tank",
      entityId: tank.id,
      newValue: { code: tank.code, type: tank.type, farmSectionId },
    });

    return tank;
  }

  async listForSection(companyId: string, farmSectionId: string) {
    await this.assertSectionInTenant(companyId, farmSectionId);

    // Sorted in JS, not by the DB's plain ORDER BY code ASC — see natural-sort.ts: a lexicographic
    // sort puts "A10" between "A1" and "A2", which looks broken once a section passes nine tanks.
    const tanks = await this.tenantPrisma.forTenant(companyId).tank.findMany({
      where: { farmSectionId, deletedAt: null },
    });
    return naturalSortByCode(tanks);
  }

  async listForFarm(companyId: string, farmId: string) {
    const tanks = await this.tenantPrisma.forTenant(companyId).tank.findMany({
      where: { deletedAt: null, farmSection: { farmId } },
    });
    return naturalSortByCode(tanks);
  }

  /**
   * Every tank across every farm, each with its own farm name and current live count/biomass —
   * stocked or empty, so this is the company-wide "one card per pond" view (vs. /fish-batches'
   * one-card-per-batch view). Mirrors FishBatchesService.listForFarm's BatchTankState query, just
   * without the farmId filter, and aggregated per tank instead of returned per batch.
   */
  async listForCompany(companyId: string) {
    const client = this.tenantPrisma.forTenant(companyId);
    const [tanks, states] = await Promise.all([
      client.tank.findMany({
        where: { deletedAt: null },
        include: { farmSection: { include: { farm: true } } },
      }),
      client.batchTankState.findMany({
        where: { estimatedCount: { gt: 0 }, tank: { deletedAt: null } },
        include: { batch: { include: { currentState: true } } },
      }),
    ]);

    const byTank = new Map<string, { liveCount: number; biomassKg: number }>();
    for (const state of states) {
      const avgWeightG = Number(state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG);
      const biomassKg = (state.estimatedCount * avgWeightG) / 1000;
      const current = byTank.get(state.tankId) ?? { liveCount: 0, biomassKg: 0 };
      current.liveCount += state.estimatedCount;
      current.biomassKg += biomassKg;
      byTank.set(state.tankId, current);
    }

    const rows = tanks.map((tank) => ({
      id: tank.id,
      code: tank.code,
      type: tank.type,
      status: tank.status,
      farmId: tank.farmSection.farm.id,
      farmName: tank.farmSection.farm.name,
      liveCount: byTank.get(tank.id)?.liveCount ?? 0,
      biomassKg: byTank.get(tank.id)?.biomassKg ?? 0,
    }));
    return naturalSortByCode(rows);
  }

  async findById(companyId: string, tankId: string) {
    const tank = await this.tenantPrisma
      .forTenant(companyId)
      .tank.findFirst({ where: { id: tankId, deletedAt: null } });
    if (!tank) {
      throw new NotFoundException("Tank not found.");
    }
    return tank;
  }

  /**
   * `findById` first (tenant-scoped `findFirst`) confirms ownership and doubles as the 404
   * check; the subsequent `.update()` by primary key is then safe even though the Prisma
   * extension can't inject a companyId filter into a unique-key update — see
   * TenantPrismaService's doc comment on why singular ops are handled this way.
   */
  async update(companyId: string, tankId: string, userId: string, dto: UpdateTankDto) {
    const existing = await this.findById(companyId, tankId);

    const updated = await this.tenantPrisma.forTenant(companyId).tank.update({
      where: { id: tankId },
      data: {
        code: dto.code ? dto.code.toUpperCase() : undefined,
        type: dto.type,
        volumeM3: dto.volumeM3,
        maxBiomassKg: dto.maxBiomassKg,
        status: dto.status,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "Tank",
      entityId: tankId,
      previousValue: {
        code: existing.code,
        type: existing.type,
        status: existing.status,
      },
      newValue: {
        code: updated.code,
        type: updated.type,
        status: updated.status,
      },
    });

    return updated;
  }

  async remove(companyId: string, tankId: string, userId: string) {
    const existing = await this.findById(companyId, tankId);

    const removed = await this.tenantPrisma.forTenant(companyId).tank.update({
      where: { id: tankId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "Tank",
      entityId: tankId,
      previousValue: { code: existing.code },
    });

    return removed;
  }
}
