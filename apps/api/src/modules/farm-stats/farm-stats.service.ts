import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTomorrow(): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

@Injectable()
export class FarmStatsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Replaces the frontend's old `mockFarmStats()` placeholder with real aggregates:
   * facility/pool counts come straight from FarmSection/Tank rows, fish/biomass are derived
   * from the fish-batch movement ledger's BatchTankState/BatchCurrentState projections (see
   * AlertsService.evaluateBiomassRule for the same derivation used to trigger capacity
   * alerts), feed is today's FeedingEvent total (the feeding side of the feed-inventory
   * ledger, not the inventory-balance side — see 09-feed-inventory-ledger.md).
   */
  async getStockSummary(companyId: string, farmId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }

    const [facilities, pools, tankStates, todayFeed, openAlertsCount] = await Promise.all([
      client.farmSection.count({ where: { farmId, deletedAt: null } }),
      client.tank.count({ where: { deletedAt: null, farmSection: { farmId } } }),
      client.batchTankState.findMany({
        where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
        include: { batch: { include: { currentState: true } } },
      }),
      client.feedingEvent.aggregate({
        where: {
          tank: { farmSection: { farmId } },
          occurredAt: { gte: startOfToday(), lt: startOfTomorrow() },
        },
        _sum: { quantityKg: true },
      }),
      client.alert.count({ where: { status: "OPEN", tank: { farmSection: { farmId } } } }),
    ]);

    const fishCount = tankStates.reduce((sum, state) => sum + state.estimatedCount, 0);
    const biomassKg = tankStates.reduce((sum, state) => {
      const avgWeightG = Number(
        state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG,
      );
      return sum + (state.estimatedCount * avgWeightG) / 1000;
    }, 0);

    return {
      facilities,
      pools,
      fishCount,
      biomassKg,
      todayFeedKg: Number(todayFeed._sum.quantityKg ?? 0),
      openAlertsCount,
    };
  }
}
