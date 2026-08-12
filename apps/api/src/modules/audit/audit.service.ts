import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

export interface RecordAuditEntryInput {
  companyId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}

/**
 * Central audit log writer. Every module that mutates state calls this as part of the same
 * database transaction as the mutation itself (docs/architecture/03-backend-modules.md §3.2:
 * "audit... foundational, depended on by all") rather than reinventing audit writes per module.
 */
@Injectable()
export class AuditService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async record(input: RecordAuditEntryInput): Promise<void> {
    await this.tenantPrisma.forTenant(input.companyId).auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        previousValue: input.previousValue as never,
        newValue: input.newValue as never,
        ipAddress: input.ipAddress,
      },
    });
  }

  async listForCompany(
    companyId: string,
    params: { page: number; pageSize: number },
  ): Promise<{ items: unknown[]; page: number; pageSize: number; total: number }> {
    const client = this.tenantPrisma.forTenant(companyId);
    const [items, total] = await Promise.all([
      client.auditLog.findMany({
        orderBy: { occurredAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      client.auditLog.count(),
    ]);
    return { items, page: params.page, pageSize: params.pageSize, total };
  }
}
