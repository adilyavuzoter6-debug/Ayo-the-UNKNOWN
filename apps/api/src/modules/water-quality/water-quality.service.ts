import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import type { CreateWaterQualityReadingDto } from "./dto/create-water-quality-reading.dto";

const METRIC_FIELDS = [
  "temperatureC",
  "dissolvedOxygenMgL",
  "ph",
  "salinityPpt",
  "ammoniaMgL",
  "nitriteMgL",
  "nitrateMgL",
  "flowRateM3H",
] as const;

@Injectable()
export class WaterQualityService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
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

  async create(
    companyId: string,
    tankId: string,
    userId: string,
    dto: CreateWaterQualityReadingDto,
  ) {
    await this.assertTankInTenant(companyId, tankId);

    const hasAnyMetric = METRIC_FIELDS.some((field) => dto[field] !== undefined);
    if (!hasAnyMetric) {
      throw new BadRequestException("At least one water quality metric must be provided.");
    }

    const reading = await this.tenantPrisma.forTenant(companyId).waterQualityReading.create({
      data: {
        companyId,
        tankId,
        source: "MANUAL",
        temperatureC: dto.temperatureC,
        dissolvedOxygenMgL: dto.dissolvedOxygenMgL,
        ph: dto.ph,
        salinityPpt: dto.salinityPpt,
        ammoniaMgL: dto.ammoniaMgL,
        nitriteMgL: dto.nitriteMgL,
        nitrateMgL: dto.nitrateMgL,
        flowRateM3H: dto.flowRateM3H,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "WaterQualityReading",
      entityId: reading.id,
      newValue: { tankId },
    });

    await this.alertsService.evaluateWaterQualityCriticalRule(companyId, tankId, reading);

    return reading;
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);

    return this.tenantPrisma.forTenant(companyId).waterQualityReading.findMany({
      where: { tankId },
      orderBy: { occurredAt: "desc" },
    });
  }
}
