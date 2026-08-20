import { Injectable } from "@nestjs/common";
import type { InventoryTxType } from "@prisma/client";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

/**
 * Fixed sign table for every transaction type except ADJUSTMENT (docs/architecture/
 * 09-feed-inventory-ledger.md §9.5) — ADJUSTMENT's `quantityKg` may itself be negative (a
 * physical recount can go either way) and is added to the running total as-is.
 */
const POSITIVE_TYPES = new Set<InventoryTxType>(["PURCHASE", "TRANSFER_IN"]);
const NEGATIVE_TYPES = new Set<InventoryTxType>([
  "TRANSFER_OUT",
  "FEED_CONSUMPTION",
  "RETURN",
  "WASTE",
]);

/**
 * Rebuilds FeedInventoryBalance (docs/architecture/04-database-schema.md §4.6) for one
 * FeedInventoryBatch by re-summing its full transaction history — never incrementally. Same
 * synchronous "re-derive, don't increment" pattern as BatchProjectionService.recompute.
 */
@Injectable()
export class FeedInventoryProjectionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async recompute(companyId: string, feedInventoryBatchId: string): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);

    const transactions = await client.feedInventoryTransaction.findMany({
      where: { feedInventoryBatchId },
    });

    const quantityOnHandKg = transactions.reduce((sum, tx) => {
      const amount = Number(tx.quantityKg);
      if (tx.type === "ADJUSTMENT") return sum + amount;
      if (POSITIVE_TYPES.has(tx.type)) return sum + Math.abs(amount);
      if (NEGATIVE_TYPES.has(tx.type)) return sum - Math.abs(amount);
      return sum;
    }, 0);

    const now = new Date();
    await client.feedInventoryBalance.upsert({
      where: { feedInventoryBatchId },
      create: { feedInventoryBatchId, quantityOnHandKg, lastRecalculatedAt: now },
      update: { quantityOnHandKg, lastRecalculatedAt: now },
    });
  }

  /** Live on-hand quantity for one batch — used for the write-time negative-balance check. */
  async getBalance(companyId: string, feedInventoryBatchId: string): Promise<number> {
    const balance = await this.tenantPrisma
      .forTenant(companyId)
      .feedInventoryBalance.findUnique({ where: { feedInventoryBatchId } });
    return balance ? Number(balance.quantityOnHandKg) : 0;
  }
}
