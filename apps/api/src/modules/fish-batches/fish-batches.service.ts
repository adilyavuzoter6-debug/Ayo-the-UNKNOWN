import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import { BatchProjectionService } from "./batch-projection.service";
import type { CreateFishBatchDto } from "./dto/create-fish-batch.dto";
import type { CreateMovementDto } from "./dto/create-movement.dto";
import type { SplitBatchDto } from "./dto/split-batch.dto";
import type { MergeBatchesDto } from "./dto/merge-batches.dto";

@Injectable()
export class FishBatchesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
    private readonly projection: BatchProjectionService,
  ) {}

  private async assertTankInTenant(companyId: string, tankId: string) {
    const tank = await this.tenantPrisma
      .forTenant(companyId)
      .tank.findFirst({ where: { id: tankId, deletedAt: null } });
    if (!tank) {
      throw new NotFoundException("Tank not found.");
    }
    return tank;
  }

  async findById(companyId: string, batchId: string) {
    const batch = await this.tenantPrisma.forTenant(companyId).fishBatch.findFirst({
      where: { id: batchId, deletedAt: null },
      include: { currentState: true, species: true },
    });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }
    return batch;
  }

  async listForCompany(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).fishBatch.findMany({
      where: { deletedAt: null },
      include: { currentState: true, species: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);
    return this.tenantPrisma.forTenant(companyId).batchTankState.findMany({
      where: { tankId, estimatedCount: { gt: 0 } },
      include: { batch: { include: { species: true } } },
    });
  }

  async create(companyId: string, userId: string, dto: CreateFishBatchDto) {
    await this.assertTankInTenant(companyId, dto.tankId);

    const batch = await this.tenantPrisma.forTenant(companyId).fishBatch.create({
      data: {
        companyId,
        lotCode: dto.lotCode,
        speciesId: dto.speciesId,
        hatcherySupplier: dto.hatcherySupplier,
        eggSource: dto.eggSource,
        hatchDate: dto.hatchDate ? new Date(dto.hatchDate) : undefined,
        farmEntryDate: new Date(dto.farmEntryDate),
        initialCount: dto.fishCount,
        initialAvgWeightG: dto.avgWeightG,
        createdById: userId,
      },
    });

    await this.tenantPrisma.forTenant(companyId).batchMovement.create({
      data: {
        companyId,
        movementType: "STOCKING",
        batchId: batch.id,
        toTankId: dto.tankId,
        fishCount: dto.fishCount,
        estimatedAvgWeightG: dto.avgWeightG,
        estimatedBiomassKg: (dto.fishCount * dto.avgWeightG) / 1000,
        occurredAt: new Date(dto.farmEntryDate),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.projection.recompute(companyId, batch.id);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FishBatch",
      entityId: batch.id,
      newValue: { lotCode: batch.lotCode, tankId: dto.tankId, fishCount: dto.fishCount },
    });

    await this.alertsService.evaluateBiomassRule(companyId, dto.tankId);

    return this.findById(companyId, batch.id);
  }

  /** Records a TRANSFER — same batch identity, reallocated to a different tank. */
  async addMovement(companyId: string, batchId: string, userId: string, dto: CreateMovementDto) {
    await this.findById(companyId, batchId);
    await this.assertTankInTenant(companyId, dto.fromTankId);
    await this.assertTankInTenant(companyId, dto.toTankId);

    const liveCount = await this.projection.getLiveTankCount(companyId, batchId, dto.fromTankId);
    if (dto.fishCount > liveCount) {
      throw new BadRequestException(
        `Cannot transfer ${dto.fishCount} fish — only ${liveCount} live in the source tank.`,
      );
    }

    await this.tenantPrisma.forTenant(companyId).batchMovement.create({
      data: {
        companyId,
        movementType: "TRANSFER",
        batchId,
        fromTankId: dto.fromTankId,
        toTankId: dto.toTankId,
        fishCount: dto.fishCount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.projection.recompute(companyId, batchId);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "BatchMovement",
      entityId: batchId,
      newValue: {
        movementType: "TRANSFER",
        fromTankId: dto.fromTankId,
        toTankId: dto.toTankId,
        fishCount: dto.fishCount,
      },
    });

    await this.alertsService.evaluateBiomassRule(companyId, dto.toTankId);

    return this.findById(companyId, batchId);
  }

  async listMovements(companyId: string, batchId: string) {
    await this.findById(companyId, batchId);
    return this.tenantPrisma.forTenant(companyId).batchMovement.findMany({
      where: { batchId },
      orderBy: { occurredAt: "desc" },
    });
  }

  async split(companyId: string, batchId: string, userId: string, dto: SplitBatchDto) {
    const parent = await this.findById(companyId, batchId);
    await this.assertTankInTenant(companyId, dto.fromTankId);

    const totalSplit = dto.splits.reduce((sum, s) => sum + s.fishCount, 0);
    const liveCount = await this.projection.getLiveTankCount(companyId, batchId, dto.fromTankId);
    if (totalSplit > liveCount) {
      throw new BadRequestException(
        `Cannot split ${totalSplit} fish — only ${liveCount} live in the source tank.`,
      );
    }

    const parentAvgWeight = parent.currentState?.estimatedAvgWeightG ?? parent.initialAvgWeightG;
    const childIds: string[] = [];

    for (const target of dto.splits) {
      await this.assertTankInTenant(companyId, target.toTankId);

      const child = await this.tenantPrisma.forTenant(companyId).fishBatch.create({
        data: {
          companyId,
          lotCode: target.lotCode,
          speciesId: parent.speciesId,
          farmEntryDate: parent.farmEntryDate,
          initialCount: target.fishCount,
          initialAvgWeightG: parentAvgWeight,
          parentBatchIds: [parent.id],
          createdById: userId,
        },
      });
      childIds.push(child.id);

      await this.tenantPrisma.forTenant(companyId).batchMovement.create({
        data: {
          companyId,
          movementType: "SPLIT",
          batchId: parent.id,
          fromBatchId: parent.id,
          toBatchId: child.id,
          fromTankId: dto.fromTankId,
          toTankId: target.toTankId,
          fishCount: target.fishCount,
          occurredAt: new Date(),
          createdById: userId,
        },
      });
    }

    await this.projection.recompute(companyId, parent.id);
    await Promise.all(childIds.map((id) => this.projection.recompute(companyId, id)));

    await this.auditService.record({
      companyId,
      userId,
      action: "SPLIT",
      entityType: "FishBatch",
      entityId: parent.id,
      newValue: { childIds, totalSplit },
    });

    return { parentId: parent.id, childIds };
  }

  async merge(companyId: string, userId: string, dto: MergeBatchesDto) {
    await this.assertTankInTenant(companyId, dto.toTankId);

    let weightedWeightSum = 0;
    let totalFish = 0;
    let speciesId: string | undefined;

    for (const source of dto.sources) {
      const sourceBatch = await this.findById(companyId, source.batchId);
      if (speciesId && speciesId !== sourceBatch.speciesId) {
        throw new BadRequestException("Cannot merge batches of different species.");
      }
      speciesId = sourceBatch.speciesId;

      const liveCount = await this.projection.getLiveTankCount(
        companyId,
        source.batchId,
        source.fromTankId,
      );
      if (source.fishCount > liveCount) {
        throw new BadRequestException(
          `Cannot merge ${source.fishCount} fish from batch ${sourceBatch.lotCode} — only ${liveCount} live in that tank.`,
        );
      }

      const avgWeight = Number(
        sourceBatch.currentState?.estimatedAvgWeightG ?? sourceBatch.initialAvgWeightG,
      );
      weightedWeightSum += avgWeight * source.fishCount;
      totalFish += source.fishCount;
    }

    // Blended weight standing in for the real Biomass Engine (Milestone 4/10) — a simple
    // fish-count-weighted average of the sources' current avg weights.
    const blendedAvgWeightG = totalFish > 0 ? weightedWeightSum / totalFish : 0;

    const merged = await this.tenantPrisma.forTenant(companyId).fishBatch.create({
      data: {
        companyId,
        lotCode: dto.lotCode,
        speciesId: speciesId!,
        farmEntryDate: new Date(),
        initialCount: totalFish,
        initialAvgWeightG: blendedAvgWeightG,
        parentBatchIds: dto.sources.map((s) => s.batchId),
        createdById: userId,
      },
    });

    for (const source of dto.sources) {
      await this.tenantPrisma.forTenant(companyId).batchMovement.create({
        data: {
          companyId,
          movementType: "MERGE",
          batchId: source.batchId,
          fromBatchId: source.batchId,
          toBatchId: merged.id,
          fromTankId: source.fromTankId,
          toTankId: dto.toTankId,
          fishCount: source.fishCount,
          occurredAt: new Date(),
          createdById: userId,
        },
      });
    }

    await Promise.all(dto.sources.map((s) => this.projection.recompute(companyId, s.batchId)));
    await this.projection.recompute(companyId, merged.id);

    await this.auditService.record({
      companyId,
      userId,
      action: "MERGE",
      entityType: "FishBatch",
      entityId: merged.id,
      newValue: { sourceBatchIds: dto.sources.map((s) => s.batchId), totalFish },
    });

    await this.alertsService.evaluateBiomassRule(companyId, dto.toTankId);

    return this.findById(companyId, merged.id);
  }

  /**
   * BatchLineageService.getFullHistory per docs/architecture/08-fish-batch-lineage.md §8.5: walk
   * fromBatchId/toBatchId edges backward to collect every ancestor batch, then return every
   * BatchMovement touching that ancestor set as a single chronological timeline.
   */
  async getHistory(companyId: string, batchId: string) {
    await this.findById(companyId, batchId);
    const client = this.tenantPrisma.forTenant(companyId);

    const ancestorIds = new Set<string>([batchId]);
    let frontier = [batchId];
    while (frontier.length > 0) {
      const edges = await client.batchMovement.findMany({
        where: { toBatchId: { in: frontier } },
        select: { fromBatchId: true },
      });
      const newIds = edges
        .map((edge) => edge.fromBatchId)
        .filter((id): id is string => !!id && !ancestorIds.has(id));
      newIds.forEach((id) => ancestorIds.add(id));
      frontier = newIds;
    }

    const idList = [...ancestorIds];
    const movements = await client.batchMovement.findMany({
      where: {
        OR: [
          { batchId: { in: idList } },
          { fromBatchId: { in: idList } },
          { toBatchId: { in: idList } },
        ],
      },
      orderBy: { occurredAt: "asc" },
    });

    return { batchIds: idList, movements };
  }
}
