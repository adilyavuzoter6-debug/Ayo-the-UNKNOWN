import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateWarehouseDto } from "./dto/create-warehouse.dto";

@Injectable()
export class WarehousesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFarmInTenant(companyId: string, farmId: string): Promise<void> {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
  }

  async create(companyId: string, farmId: string, userId: string, dto: CreateWarehouseDto) {
    await this.assertFarmInTenant(companyId, farmId);

    const warehouse = await this.tenantPrisma.forTenant(companyId).warehouse.create({
      data: { companyId, farmId, name: dto.name },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "Warehouse",
      entityId: warehouse.id,
      newValue: { name: warehouse.name, farmId },
    });

    return warehouse;
  }

  async listForCompany(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async listForFarm(companyId: string, farmId: string) {
    await this.assertFarmInTenant(companyId, farmId);

    return this.tenantPrisma.forTenant(companyId).warehouse.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async findById(companyId: string, warehouseId: string) {
    const warehouse = await this.tenantPrisma
      .forTenant(companyId)
      .warehouse.findFirst({ where: { id: warehouseId, deletedAt: null } });
    if (!warehouse) {
      throw new NotFoundException("Warehouse not found.");
    }
    return warehouse;
  }
}
