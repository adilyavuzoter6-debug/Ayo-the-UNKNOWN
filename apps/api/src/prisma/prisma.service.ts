import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Thin wrapper around PrismaClient, connection lifecycle only.
 *
 * Deliberately NOT injected directly into module services — see
 * src/prisma/tenant-prisma.service.ts and docs/architecture/06-multi-tenant-security.md §6.2.
 * This class also carries the documented (currently no-op) hook point for setting the RLS
 * session variable per request once Row Level Security is enabled (§6.2 Layer 2).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Prisma connected.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * RLS activation hook (docs/architecture/06-multi-tenant-security.md §6.2 Layer 2).
   * No-op today — application-layer tenant scoping (TenantPrismaService) is the enforced
   * control. When RLS is turned on, this executes `SET LOCAL app.current_company_id` inside
   * the request's transaction before any query runs.
   */
  async withRlsContext<T>(_companyId: string, work: () => Promise<T>): Promise<T> {
    return work();
  }
}
