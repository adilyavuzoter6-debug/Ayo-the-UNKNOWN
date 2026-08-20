import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateFeedProductDto } from "./dto/create-feed-product.dto";

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

  async create(companyId: string, userId: string, dto: CreateFeedProductDto) {
    const product = await this.tenantPrisma.forTenant(companyId).feedProduct.create({
      data: {
        companyId,
        name: dto.name,
        manufacturer: dto.manufacturer,
        pelletSizeMm: dto.pelletSizeMm,
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
}
