import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import { StockingCostService } from "../costs/stocking-cost.service";
import { BatchProjectionService } from "./batch-projection.service";
import type { CreateFishBatchDto } from "./dto/create-fish-batch.dto";
import type { CreateMovementDto } from "./dto/create-movement.dto";
import type { CreateBatchAdjustmentDto } from "./dto/create-adjustment.dto";
import type { SplitBatchDto } from "./dto/split-batch.dto";
import type { MergeBatchesDto } from "./dto/merge-batches.dto";
import type { UpdateStockingDto } from "./dto/update-stocking.dto";

@Injectable()
export class FishBatchesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
    private readonly projection: BatchProjectionService,
    private readonly stockingCosts: StockingCostService,
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

  /** The ponds a batch is in right now (live count above zero), each with its farm. Read-only. */
  async listTankStates(companyId: string, batchId: string) {
    await this.findById(companyId, batchId);
    return this.tenantPrisma.forTenant(companyId).batchTankState.findMany({
      where: { batchId, estimatedCount: { gt: 0 } },
      include: { tank: { include: { farmSection: { include: { farm: true } } } } },
    });
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
      include: { batch: { include: { species: true, currentState: true } } },
    });
  }

  private async assertFarmInTenant(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    return farm;
  }

  /**
   * Every allocation across every tank in the farm, in one query — replaces the frontend
   * fanning out N requests (one per tank) through useQueries. Same shape as listForTank, just
   * farm-scoped via the Tank -> FarmSection -> Farm chain (same `tank: { farmSection: { farmId
   * } }` pattern FarmStatsService already uses for its own farm-wide rollups).
   */
  async listForFarm(companyId: string, farmId: string) {
    await this.assertFarmInTenant(companyId, farmId);
    return this.tenantPrisma.forTenant(companyId).batchTankState.findMany({
      where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId }, deletedAt: null } },
      include: { batch: { include: { species: true, currentState: true } } },
    });
  }

  /**
   * Every TRANSFER movement for batches currently stocked in this farm, newest first, with
   * lot/tank codes pre-joined. Replaces the frontend's 3-level waterfall (tanks -> per-tank
   * allocations -> per-batch movements, up to dozens of sequential round trips) with 3 queries
   * run server-side in one request. fromTank/toTank are looked up separately (not a declared
   * Prisma relation on BatchMovement) because a transfer's source tank can be outside this farm.
   */
  async listTransfersForFarm(companyId: string, farmId: string) {
    await this.assertFarmInTenant(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);

    const allocations = await client.batchTankState.findMany({
      where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
      select: { batchId: true, batch: { select: { lotCode: true } } },
    });
    const batchIds = Array.from(new Set(allocations.map((a) => a.batchId)));
    if (batchIds.length === 0) {
      return [];
    }
    const lotCodeByBatchId = new Map(allocations.map((a) => [a.batchId, a.batch.lotCode]));

    const movements = await client.batchMovement.findMany({
      where: { batchId: { in: batchIds }, movementType: "TRANSFER" },
      orderBy: { occurredAt: "desc" },
    });

    const tankIds = Array.from(
      new Set(
        movements.flatMap((m) => [m.fromTankId, m.toTankId]).filter((id): id is string => !!id),
      ),
    );
    const tanks =
      tankIds.length > 0
        ? await client.tank.findMany({ where: { id: { in: tankIds } }, select: { id: true, code: true } })
        : [];
    const tankCodeById = new Map(tanks.map((t) => [t.id, t.code]));

    return movements.map((m) => ({
      ...m,
      lotCode: lotCodeByBatchId.get(m.batchId) ?? "—",
      fromTankCode: m.fromTankId ? (tankCodeById.get(m.fromTankId) ?? null) : null,
      toTankCode: m.toTankId ? (tankCodeById.get(m.toTankId) ?? null) : null,
    }));
  }

  async create(companyId: string, userId: string, dto: CreateFishBatchDto) {
    await this.assertTankInTenant(companyId, dto.tankId);
    const farmEntryDate = new Date(dto.farmEntryDate);

    // Price is resolved (incl. the exchange rate) before anything is written: a bad stocking input or a
    // failed rate lookup must not leave a batch that exists without its cost.
    const prepared = await this.stockingCosts.prepare(
      {
        source: dto.stockingSource,
        fishCount: dto.fishCount,
        eggCount: dto.eggCount,
        unitPrice: dto.stockingUnitPrice,
        currency: dto.stockingCurrency,
        exchangeRate: dto.stockingExchangeRate,
      },
      farmEntryDate,
    );

    const batch = await this.tenantPrisma.forTenant(companyId).fishBatch.create({
      data: {
        companyId,
        lotCode: dto.lotCode,
        speciesId: dto.speciesId,
        hatcherySupplier: dto.hatcherySupplier,
        eggSource: dto.eggSource,
        hatchDate: dto.hatchDate ? new Date(dto.hatchDate) : undefined,
        farmEntryDate,
        initialCount: dto.fishCount,
        initialAvgWeightG: dto.avgWeightG,
        stockingSource: dto.stockingSource,
        eggCount: dto.eggCount,
        stockingUnitPrice: dto.stockingUnitPrice,
        stockingCurrency: prepared ? prepared.currency : undefined,
        stockingExchangeRate: prepared ? prepared.exchangeRate : undefined,
        createdById: userId,
      },
    });

    if (prepared) {
      await this.stockingCosts.book(companyId, userId, {
        batchId: batch.id,
        tankId: dto.tankId,
        incurredAt: farmEntryDate,
        prepared,
      });
    }

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

  /**
   * A direct correction to the batch's count in one tank — not mortality, not a transfer. Kept out
   * of BatchMovement's STOCKING/TRANSFER/HARVEST_REMOVAL accounting on purpose: it exists so a count
   * can be fixed without the fish reading as dead or as moved anywhere.
   */
  async createAdjustment(companyId: string, batchId: string, userId: string, dto: CreateBatchAdjustmentDto) {
    await this.findById(companyId, batchId);
    await this.assertTankInTenant(companyId, dto.tankId);
    if (dto.fishCount === 0) {
      throw new BadRequestException("Düzeltme sıfır olamaz.");
    }

    if (dto.fishCount < 0) {
      const liveCount = await this.projection.getLiveTankCount(companyId, batchId, dto.tankId);
      if (-dto.fishCount > liveCount) {
        throw new BadRequestException(
          `Bu havuzda yalnızca ${liveCount} canlı balık var; ${-dto.fishCount} düşülemez.`,
        );
      }
    }

    await this.tenantPrisma.forTenant(companyId).batchMovement.create({
      data: {
        companyId,
        movementType: "ADJUSTMENT",
        batchId,
        fromTankId: dto.fishCount < 0 ? dto.tankId : undefined,
        toTankId: dto.fishCount > 0 ? dto.tankId : undefined,
        fishCount: Math.abs(dto.fishCount),
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
      newValue: { movementType: "ADJUSTMENT", tankId: dto.tankId, fishCount: dto.fishCount },
    });

    return this.findById(companyId, batchId);
  }

  async listMovements(companyId: string, batchId: string) {
    await this.findById(companyId, batchId);
    return this.tenantPrisma.forTenant(companyId).batchMovement.findMany({
      where: { batchId },
      orderBy: { occurredAt: "desc" },
    });
  }

  /** Corrects how a batch was stocked and its price; the stocking cost entry follows the batch. */
  async updateStocking(companyId: string, batchId: string, userId: string, dto: UpdateStockingDto) {
    const batch = await this.findById(companyId, batchId);
    const prepared = await this.stockingCosts.prepare(
      {
        source: dto.stockingSource,
        fishCount: batch.initialCount,
        eggCount: dto.eggCount,
        unitPrice: dto.stockingUnitPrice,
        currency: dto.stockingCurrency,
        exchangeRate: dto.stockingExchangeRate,
      },
      batch.farmEntryDate,
    );

    await this.stockingCosts.replace(companyId, userId, {
      batchId,
      farmEntryDate: batch.farmEntryDate,
      prepared,
    });

    await this.tenantPrisma.forTenant(companyId).fishBatch.updateMany({
      where: { id: batchId },
      data: {
        stockingSource: dto.stockingSource ?? null,
        eggCount: dto.eggCount ?? null,
        stockingUnitPrice: prepared ? dto.stockingUnitPrice : null,
        stockingCurrency: prepared ? prepared.currency : null,
        stockingExchangeRate: prepared ? prepared.exchangeRate : null,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "FishBatch",
      entityId: batchId,
      newValue: { stockingSource: dto.stockingSource ?? null, priced: prepared !== null },
    });
    return this.findById(companyId, batchId);
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
    // Stocking cost follows the fish: each child takes its share of the fish still left in the parent.
    let remainingFish = Number(parent.currentState?.estimatedCount ?? 0);

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

      await this.stockingCosts.transfer(companyId, userId, {
        fromBatchId: parent.id,
        toBatchId: child.id,
        fraction: remainingFish > 0 ? target.fishCount / remainingFish : 0,
        reference: child.id,
      });
      remainingFish -= target.fishCount;
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
    const liveByBatch = new Map<string, number>();

    for (const source of dto.sources) {
      const sourceBatch = await this.findById(companyId, source.batchId);
      if (speciesId && speciesId !== sourceBatch.speciesId) {
        throw new BadRequestException("Cannot merge batches of different species.");
      }
      speciesId = sourceBatch.speciesId;
      liveByBatch.set(source.batchId, Number(sourceBatch.currentState?.estimatedCount ?? 0));

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

    // Each source's stocking cost follows the fish it sends: its share of the fish it had live.
    for (const source of dto.sources) {
      const live = liveByBatch.get(source.batchId) ?? 0;
      await this.stockingCosts.transfer(companyId, userId, {
        fromBatchId: source.batchId,
        toBatchId: merged.id,
        fraction: live > 0 ? source.fishCount / live : 0,
        reference: `${merged.id}:${source.batchId}`,
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
