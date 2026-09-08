import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateFishSpeciesDto } from "./dto/create-fish-species.dto";
import type { UpdateFishSpeciesDto } from "./dto/update-fish-species.dto";

@Injectable()
export class FishSpeciesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Company's own custom strains plus every global (companyId: null) reference species. */
  async listForCompany(companyId: string) {
    return this.tenantPrisma.findSpeciesForCompany(companyId);
  }

  /**
   * `.forTenant(companyId).fishSpecies.findFirst` auto-injects `companyId` into the where
   * clause, so a global reference species (companyId: null) or another tenant's species both
   * come back as "not found" here — the same way any other cross-tenant probe does. This is
   * deliberate: thresholds live on the row itself, so editing a *global* species would silently
   * change alert behavior for every other tenant using it. A company that wants its own
   * thresholds creates its own species entry (already supported) rather than mutating shared data.
   */
  private async findById(companyId: string, speciesId: string) {
    const species = await this.tenantPrisma
      .forTenant(companyId)
      .fishSpecies.findFirst({ where: { id: speciesId } });
    if (!species) {
      throw new NotFoundException("Fish species not found.");
    }
    return species;
  }

  async create(companyId: string, userId: string, dto: CreateFishSpeciesDto) {
    const species = await this.tenantPrisma.forTenant(companyId).fishSpecies.create({
      data: {
        name: dto.name,
        strain: dto.strain,
        criticalDoMgL: dto.criticalDoMgL,
        criticalPhLow: dto.criticalPhLow,
        criticalPhHigh: dto.criticalPhHigh,
        criticalTempHighC: dto.criticalTempHighC,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FishSpecies",
      entityId: species.id,
      newValue: { name: species.name, strain: species.strain },
    });

    return species;
  }

  async update(companyId: string, speciesId: string, userId: string, dto: UpdateFishSpeciesDto) {
    const existing = await this.findById(companyId, speciesId);

    const updated = await this.tenantPrisma.forTenant(companyId).fishSpecies.update({
      where: { id: speciesId },
      data: {
        name: dto.name,
        strain: dto.strain,
        criticalDoMgL: dto.criticalDoMgL,
        criticalPhLow: dto.criticalPhLow,
        criticalPhHigh: dto.criticalPhHigh,
        criticalTempHighC: dto.criticalTempHighC,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "FishSpecies",
      entityId: speciesId,
      previousValue: {
        name: existing.name,
        strain: existing.strain,
        criticalDoMgL: existing.criticalDoMgL,
        criticalPhLow: existing.criticalPhLow,
        criticalPhHigh: existing.criticalPhHigh,
        criticalTempHighC: existing.criticalTempHighC,
      },
      newValue: {
        name: updated.name,
        strain: updated.strain,
        criticalDoMgL: updated.criticalDoMgL,
        criticalPhLow: updated.criticalPhLow,
        criticalPhHigh: updated.criticalPhHigh,
        criticalTempHighC: updated.criticalTempHighC,
      },
    });

    return updated;
  }
}
