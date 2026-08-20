import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
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

    return this.tenantPrisma.forTenant(companyId).tank.findMany({
      where: { farmSectionId, deletedAt: null },
      orderBy: { code: "asc" },
    });
  }

  async listForFarm(companyId: string, farmId: string) {
    return this.tenantPrisma.forTenant(companyId).tank.findMany({
      where: { deletedAt: null, farmSection: { farmId } },
      orderBy: { code: "asc" },
    });
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
