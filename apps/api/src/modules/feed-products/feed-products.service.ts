import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateFeedProductDto, UpdateFeedProductDto } from "./dto/create-feed-product.dto";

@Injectable()
export class FeedProductsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listForCompany(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).feedProduct.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  private async assertProduct(companyId: string, id: string) {
    const product = await this.tenantPrisma
      .forTenant(companyId)
      .feedProduct.findFirst({ where: { id, deletedAt: null } });
    if (!product) {
      throw new NotFoundException("Feed product not found.");
    }
    return product;
  }

  async create(companyId: string, userId: string, dto: CreateFeedProductDto) {
    const product = await this.tenantPrisma.forTenant(companyId).feedProduct.create({
      data: {
        companyId,
        name: dto.name,
        manufacturer: dto.manufacturer,
        pelletSizeMm: dto.pelletSizeMm?.trim(),
        proteinPct: dto.proteinPct,
        fatPct: dto.fatPct,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FeedProduct",
      entityId: product.id,
      newValue: { name: product.name },
    });

    return product;
  }

  /** Corrects the catalog entry. Lots already received keep showing the name they were bought under. */
  async update(companyId: string, userId: string, id: string, dto: UpdateFeedProductDto) {
    const existing = await this.assertProduct(companyId, id);
    const updated = await this.tenantPrisma.forTenant(companyId).feedProduct.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        manufacturer: dto.manufacturer !== undefined ? dto.manufacturer : existing.manufacturer,
        pelletSizeMm: dto.pelletSizeMm !== undefined ? dto.pelletSizeMm.trim() : existing.pelletSizeMm,
        proteinPct: dto.proteinPct !== undefined ? dto.proteinPct : existing.proteinPct,
        fatPct: dto.fatPct !== undefined ? dto.fatPct : existing.fatPct,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "FeedProduct",
      entityId: id,
      previousValue: { name: existing.name },
      newValue: { name: updated.name },
    });
    return updated;
  }

  /** Removes a product from the catalog. Lots already received are untouched and keep its name. */
  async remove(companyId: string, userId: string, id: string) {
    const existing = await this.assertProduct(companyId, id);
    await this.tenantPrisma.forTenant(companyId).feedProduct.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "FeedProduct",
      entityId: id,
      previousValue: { name: existing.name },
    });
    return { deleted: true as const };
  }

  /** Removed products, newest first — so one removed by mistake can be found and brought back. */
  async listDeleted(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).feedProduct.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 50,
    });
  }

  /** Undoes a removal. The product reappears wherever active products are offered. */
  async restore(companyId: string, userId: string, id: string) {
    const existing = await this.tenantPrisma
      .forTenant(companyId)
      .feedProduct.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!existing) {
      throw new NotFoundException("Removed feed product not found.");
    }
    const restored = await this.tenantPrisma.forTenant(companyId).feedProduct.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "RESTORE",
      entityType: "FeedProduct",
      entityId: id,
      newValue: { name: restored.name },
    });
    return restored;
  }
}
