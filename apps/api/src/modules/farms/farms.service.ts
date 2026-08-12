import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateFarmDto } from "./dto/create-farm.dto";

@Injectable()
export class FarmsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(companyId: string, userId: string, dto: CreateFarmDto) {
    const farm = await this.tenantPrisma.forTenant(companyId).farm.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        timezone: dto.timezone,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "Farm",
      entityId: farm.id,
      newValue: { name: farm.name, code: farm.code },
    });

    return farm;
  }

  async list(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).farm.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * `findFirst` (not `findUnique`) so the TenantPrismaService extension can inject the
   * `companyId` filter into `where` — see docs/architecture/06-multi-tenant-security.md §6.2
   * point 3. A mismatched or nonexistent id both resolve to the same NotFoundException, so a
   * cross-tenant ID probe can't distinguish "wrong tenant" from "doesn't exist".
   */
  async findById(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma.forTenant(companyId).farm.findFirst({
      where: { id: farmId },
    });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    return farm;
  }
}
