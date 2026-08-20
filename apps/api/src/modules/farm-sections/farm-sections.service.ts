import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateFarmSectionDto } from "./dto/create-farm-section.dto";
import type { UpdateFarmSectionDto } from "./dto/update-farm-section.dto";

@Injectable()
export class FarmSectionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFarmInTenant(companyId: string, farmId: string): Promise<void> {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
  }

  async create(companyId: string, farmId: string, userId: string, dto: CreateFarmSectionDto) {
    await this.assertFarmInTenant(companyId, farmId);

    const section = await this.tenantPrisma.forTenant(companyId).farmSection.create({
      data: { companyId, farmId, name: dto.name },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FarmSection",
      entityId: section.id,
      newValue: { name: section.name, farmId },
    });

    return section;
  }

  async listForFarm(companyId: string, farmId: string) {
    await this.assertFarmInTenant(companyId, farmId);

    return this.tenantPrisma.forTenant(companyId).farmSection.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async findById(companyId: string, sectionId: string) {
    const section = await this.tenantPrisma
      .forTenant(companyId)
      .farmSection.findFirst({ where: { id: sectionId, deletedAt: null } });
    if (!section) {
      throw new NotFoundException("Farm section not found.");
    }
    return section;
  }

  /**
   * `findById` first (tenant-scoped `findFirst`) confirms ownership and doubles as the 404
   * check; the subsequent `.update()` by primary key is then safe even though the Prisma
   * extension can't inject a companyId filter into a unique-key update — see
   * TenantPrismaService's doc comment on why singular ops are handled this way.
   */
  async update(companyId: string, sectionId: string, userId: string, dto: UpdateFarmSectionDto) {
    const existing = await this.findById(companyId, sectionId);

    const updated = await this.tenantPrisma.forTenant(companyId).farmSection.update({
      where: { id: sectionId },
      data: { name: dto.name ?? existing.name },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "FarmSection",
      entityId: sectionId,
      previousValue: { name: existing.name },
      newValue: { name: updated.name },
    });

    return updated;
  }

  async remove(companyId: string, sectionId: string, userId: string) {
    const existing = await this.findById(companyId, sectionId);

    const removed = await this.tenantPrisma.forTenant(companyId).farmSection.update({
      where: { id: sectionId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "FarmSection",
      entityId: sectionId,
      previousValue: { name: existing.name },
    });

    return removed;
  }
}
