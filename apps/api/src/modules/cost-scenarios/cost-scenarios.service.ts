import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { CostsService } from "../costs/costs.service";
import { SgrCalculationService } from "../batch-performance/sgr-calculation.service";
import type { CalculateScenariosDto, ScenarioInputDto, SaveScenarioDto } from "./dto/scenario-input.dto";
import { calculateScenario, ScenarioError, ScenarioInput, ScenarioResult } from "./projection.engine";

const MAX_SCENARIOS = 8;

/**
 * Maps the transport shape onto the engine's input. Missing numbers stay missing so the engine can
 * refuse them with a precise message.
 */
export function toEngineInput(dto: ScenarioInputDto): ScenarioInput {
  return {
    startCount: dto.startCount as number,
    startAvgWeightG: dto.startAvgWeightG as number,
    startAccumulatedCostTry: dto.startAccumulatedCostTry as number,
    targetWeightG: dto.targetWeightG as number,
    mode: dto.mode,
    feedPriceTryPerKg: dto.feedPriceTryPerKg,
    fcr: dto.fcr,
    durationDays: dto.durationDays,
    mortalityPct: dto.mortalityPct,
    sgrPctPerDay: dto.sgrPctPerDay,
    stages: dto.stages?.map((s) => ({
      minG: s.minG as number,
      maxG: s.maxG as number,
      feedPriceTryPerKg: s.feedPriceTryPerKg as number,
      fcr: s.fcr as number,
      durationDays: s.durationDays as number,
      mortalityPct: s.mortalityPct as number,
    })),
    expenses: dto.expenses ?? [],
  };
}

export type ScenarioOutcome = { ok: true; result: ScenarioResult } | { ok: false; error: string };

@Injectable()
export class CostScenariosService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly costs: CostsService,
    private readonly sgr: SgrCalculationService,
  ) {}

  private async assertFarm(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
  }

  /**
   * What is already known about a batch, to start a scenario from: its live count and average weight, and
   * what it has cost so far (the figure the cost page shows, so the two agree). Feed price is the last
   * priced purchase on the farm, offered as a starting point; the user can change it.
   */
  async prefill(companyId: string, farmId: string, batchId: string) {
    await this.assertFarm(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);

    const batch = await client.fishBatch.findFirst({
      where: { id: batchId, deletedAt: null },
      include: { currentState: true },
    });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }
    if (!batch.currentState || batch.currentState.estimatedCount <= 0) {
      throw new BadRequestException("Bu partide canlı balık yok; hesap için başlangıç bilgilerini elle girin.");
    }

    // A batch of this company that never sat in this farm is not this farm's to plan.
    const inFarm = await client.batchTankState.findFirst({
      where: { batchId, tank: { farmSection: { farmId } } },
      select: { tankId: true },
    });
    if (!inFarm) {
      throw new NotFoundException("Fish batch not found in this farm.");
    }

    const tankState = await client.batchTankState.findFirst({
      where: { batchId, estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
      select: { tankId: true },
    });

    // All-time cost of this farm's batches, so this batch's realized cost is the same number the cost
    // page shows for it.
    const summary = await this.costs.getCostSummary(
      companyId,
      farmId,
      new Date(0),
      new Date(Date.now() + 60_000),
    );
    const row = summary.batchBreakdown.find((r) => r.batchId === batchId);

    // Growth rate from the batch's own weight samples: the average of its measured periods. Null when the
    // batch has not been weighed twice yet, in which case the user types a rate or a duration.
    const growthSeries = await this.sgr.calculateSeries(companyId, batchId);
    const sgrPctPerDay =
      growthSeries.length > 0
        ? growthSeries.reduce((sum, p) => sum + p.sgrPctPerDay, 0) / growthSeries.length
        : null;

    const lastLot = await client.feedInventoryBatch.findFirst({
      where: { warehouse: { farmId }, unitCostPerKg: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { unitCostPerKg: true },
    });

    return {
      batchId,
      lotCode: batch.lotCode,
      tankId: tankState?.tankId ?? null,
      startCount: batch.currentState.estimatedCount,
      startAvgWeightG: Number(batch.currentState.estimatedAvgWeightG),
      startAccumulatedCostTry: row?.fullCostTry ?? 0,
      sgrPctPerDay,
      feedPriceTryPerKg: lastLot ? Number(lastLot.unitCostPerKg) : null,
      feedPriceSource: lastLot ? "LAST_PURCHASE" : null,
    };
  }

  /** Runs one or more scenarios. A scenario with a problem comes back with its message; the others still run. */
  async calculate(companyId: string, farmId: string, dto: CalculateScenariosDto) {
    await this.assertFarm(companyId, farmId);
    if (dto.scenarios.length === 0 || dto.scenarios.length > MAX_SCENARIOS) {
      throw new BadRequestException(`En fazla ${MAX_SCENARIOS} senaryo karşılaştırılabilir.`);
    }
    const results: ScenarioOutcome[] = dto.scenarios.map((s) => {
      try {
        return { ok: true, result: calculateScenario(toEngineInput(s)) };
      } catch (error) {
        if (error instanceof ScenarioError) return { ok: false, error: error.message };
        throw error;
      }
    });
    return { results };
  }

  /** Stores a scenario's inputs. Refused unless the inputs calculate, so nothing unusable is kept. */
  async save(companyId: string, farmId: string, userId: string, dto: SaveScenarioDto) {
    await this.assertFarm(companyId, farmId);
    const input = toEngineInput(dto.scenario);
    try {
      calculateScenario(input);
    } catch (error) {
      if (error instanceof ScenarioError) throw new BadRequestException(error.message);
      throw error;
    }

    const created = await this.tenantPrisma.forTenant(companyId).costScenario.create({
      data: {
        companyId,
        farmId,
        batchId: dto.batchId ?? null,
        tankId: dto.tankId ?? null,
        name: dto.name.trim(),
        // The engine's input as plain JSON: no undefined keys, no transport-only fields.
        input: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
        createdById: userId,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "CostScenario",
      entityId: created.id,
      newValue: { farmId, name: created.name, batchId: created.batchId },
    });
    return created;
  }

  async list(companyId: string, farmId: string) {
    await this.assertFarm(companyId, farmId);
    return this.tenantPrisma.forTenant(companyId).costScenario.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async remove(companyId: string, farmId: string, userId: string, id: string) {
    await this.assertFarm(companyId, farmId);
    const result = await this.tenantPrisma.forTenant(companyId).costScenario.updateMany({
      where: { id, farmId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Scenario not found.");
    }
    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "CostScenario",
      entityId: id,
      newValue: { farmId },
    });
    return { deleted: true };
  }
}
