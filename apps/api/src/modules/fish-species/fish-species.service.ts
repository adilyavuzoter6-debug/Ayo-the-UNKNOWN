import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateFishSpeciesDto } from "./dto/create-fish-species.dto";

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

  async create(companyId: string, userId: string, dto: CreateFishSpeciesDto) {
    const species = await this.tenantPrisma.forTenant(companyId).fishSpecies.create({
      data: { name: dto.name, strain: dto.strain },
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
}
