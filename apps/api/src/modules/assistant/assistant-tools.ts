import { Injectable } from "@nestjs/common";
import { Permission, ROLE_PERMISSIONS } from "@aquai/types";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import type { TenantContext } from "../../common/types/request-context";
import { FarmStatsService } from "../farm-stats/farm-stats.service";
import { ReportsService } from "../reports/reports.service";
import type { AssistantTool } from "./assistant-tool";

/** Typed by hand per tool; runTool has already checked the input against the schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tool = (definition: Omit<AssistantTool, "run"> & { run: (input: any) => Promise<string> }): AssistantTool =>
  definition as AssistantTool;

const DAY_MS = 86_400_000;
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const json = (value: unknown) => JSON.stringify(value);

/**
 * The assistant's tools: read-only views of the company's data, built on the same services the
 * app's pages use so the assistant sees the numbers the user sees. Each tool is only offered when
 * the member's role could open the matching page, and farm-scoped members only reach their farms.
 */
@Injectable()
export class AssistantTools {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly farmStats: FarmStatsService,
    private readonly reports: ReportsService,
  ) {}

  forTenant(tenant: TenantContext): AssistantTool[] {
    const can = (permission: Permission) => ROLE_PERMISSIONS[tenant.role].includes(permission);
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const inScope = (farmId: string) => tenant.farmScopeIds.length === 0 || tenant.farmScopeIds.includes(farmId);
    const visibleFarms = async () =>
      (
        await client.farm.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, code: true },
          orderBy: { createdAt: "asc" },
        })
      ).filter((f) => inScope(f.id));
    // Every tool answers errors as data, so the model can say what went wrong instead of failing.
    const safely = async (work: () => Promise<unknown>) => {
      try {
        return json(await work());
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Veri alınamadı." });
      }
    };
    const farmGuard = async (farmId: string) => {
      const farm = (await visibleFarms()).find((f) => f.id === farmId);
      if (!farm) throw new Error("Bu çiftlik bulunamadı. Önce list_farms ile çiftlik kimliklerini alın.");
      return farm;
    };

    const tools: (AssistantTool | false)[] = [
      can(Permission.FISH_BATCH_READ) &&
        tool({
          name: "list_farms",
          description:
            "Lists the company's farms with their id, name and code, and each farm's live stock: facilities, ponds/tanks, live fish, biomass (kg), today's feed (kg) and open alerts. Call this first to get farm ids.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          run: () =>
            safely(async () => {
              const overview = await this.farmStats.getFarmsOverview(tenant.companyId);
              return overview
                .filter((o) => inScope(o.farm.id))
                .map((o) => ({
                  id: o.farm.id,
                  name: o.farm.name,
                  code: o.farm.code,
                  ...o.summary,
                  biomassKg: o.summary ? round(o.summary.biomassKg, 0) : null,
                }));
            }),
        }),

      can(Permission.FISH_BATCH_READ) &&
        tool({
          name: "farm_kpis",
          description:
            "Key figures for one farm right now: live fish, biomass (kg), active batches, average FCR over the last 30 days (feed / weight gain), average SGR (%/day), 7-day mortality (% of live stock), today's feed (kg) and open alerts.",
          inputSchema: {
            type: "object",
            properties: { farmId: { type: "string", description: "Farm id from list_farms" } },
            required: ["farmId"],
            additionalProperties: false,
          },
          run: ({ farmId }: { farmId: string }) =>
            safely(async () => {
              await farmGuard(farmId);
              const k = await this.farmStats.getDashboardKpis(tenant.companyId, farmId);
              return {
                ...k,
                biomassKg: round(k.biomassKg, 0),
                avgFcr: k.avgFcr === null ? null : round(k.avgFcr),
                avgSgrPctPerDay: k.avgSgrPctPerDay === null ? null : round(k.avgSgrPctPerDay),
                mortalityRate7dPct: round(k.mortalityRate7dPct),
              };
            }),
        }),

      can(Permission.FISH_BATCH_READ) &&
        tool({
          name: "farm_daily_trend",
          description:
            "One farm's day-by-day history: feed given (kg), fish lost, harvested kg, and the day's average water temperature (°C) and dissolved oxygen (mg/L). Use it to explain changes over time.",
          inputSchema: {
            type: "object",
            properties: {
              farmId: { type: "string", description: "Farm id from list_farms" },
              days: { type: "integer", minimum: 7, maximum: 90, description: "How many days back (default 30)" },
            },
            required: ["farmId"],
            additionalProperties: false,
          },
          run: ({ farmId, days }: { farmId: string; days?: number }) =>
            safely(async () => {
              await farmGuard(farmId);
              return this.farmStats.getDailyTrend(tenant.companyId, farmId, days ?? 30);
            }),
        }),

      can(Permission.FISH_BATCH_READ) &&
        tool({
          name: "weight_forecast",
          description:
            "Projects a farm's live fish forward month by month: how many fish and how much biomass in each weight range (grams). Each batch grows at its own recorded rate (feed and weight gain since stocking) and the farm's recent mortality continues. It is a projection from records, not a certainty, and it ignores future harvests and transfers.",
          inputSchema: {
            type: "object",
            properties: {
              farmId: { type: "string", description: "Farm id from list_farms" },
              monthsAhead: { type: "integer", minimum: 1, maximum: 12, description: "Which month ahead to report" },
              bucketWidthG: { type: "integer", minimum: 10, maximum: 500, description: "Width of each weight range in grams (default 50)" },
            },
            required: ["farmId", "monthsAhead"],
            additionalProperties: false,
          },
          run: ({ farmId, monthsAhead, bucketWidthG }: { farmId: string; monthsAhead: number; bucketWidthG?: number }) =>
            safely(async () => {
              await farmGuard(farmId);
              const forecast = await this.farmStats.getWeightForecast(tenant.companyId, [farmId], bucketWidthG ?? 50, null);
              const month = forecast.months.find((m) => m.monthsAhead === monthsAhead);
              return {
                monthsAhead,
                dailyMortalityRatePct: round(forecast.dailyMortalityRatePct, 3),
                batchesProjected: forecast.totalActiveBatches,
                batchesWithoutGrowthData: forecast.batchesFlat,
                totalFish: month?.totalCount ?? 0,
                totalBiomassKg: round(month?.totalBiomassKg ?? 0, 0),
                ranges: (month?.buckets ?? []).map((b) => ({
                  fromG: b.startG,
                  toG: b.endG,
                  fish: b.fishCount,
                  biomassKg: round(b.biomassKg, 0),
                  batches: b.batchCount,
                })),
              };
            }),
        }),

      can(Permission.FISH_BATCH_READ) &&
        tool({
          name: "anomalies",
          description:
            "Batches flagged by the app's anomaly rules: FCR well above the batch's target or its species' median, implausibly low FCR (likely missing feed records), or deaths in the last 7 days well above the batch's previous 4 weeks. Each comes with severity, the numbers and the reasons.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          run: () => safely(() => this.reports.anomalies(tenant)),
        }),

      can(Permission.INSPECTION_REPORT_READ) &&
        tool({
          name: "compare_farms",
          description:
            "Puts every farm side by side for a period: live fish and biomass now, feed given, realized FCR, deaths and mortality %, harvest, water temperature and oxygen, alerts, and (when the member may see costs) expenses, sales and period result.",
          inputSchema: {
            type: "object",
            properties: {
              periodStart: { type: "string", description: "YYYY-MM-DD" },
              periodEnd: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["periodStart", "periodEnd"],
            additionalProperties: false,
          },
          run: ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) =>
            safely(() =>
              this.reports.farmComparison(tenant, new Date(periodStart), new Date(`${periodEnd}T23:59:59.999Z`)),
            ),
        }),

      can(Permission.FISH_BATCH_READ) &&
        tool({
          name: "batch_details",
          description:
            "One batch (lot) by its lot code: species, stocking date, initial and current count and average weight, where it is, the last weighings, feed and deaths in the last 30 days, and treatments still running or in their withdrawal period.",
          inputSchema: {
            type: "object",
            properties: { lotCode: { type: "string", description: "Lot code, e.g. AB-2026-014" } },
            required: ["lotCode"],
            additionalProperties: false,
          },
          run: ({ lotCode }: { lotCode: string }) =>
            safely(async () => {
              const batch = await client.fishBatch.findFirst({
                where: { lotCode: { equals: lotCode, mode: "insensitive" }, deletedAt: null },
                include: {
                  species: { select: { name: true } },
                  currentState: true,
                  tankStates: {
                    where: { estimatedCount: { gt: 0 } },
                    include: { tank: { select: { code: true, farmSection: { select: { farmId: true, farm: { select: { name: true } } } } } } },
                  },
                },
              });
              if (!batch || !batch.tankStates.every((s) => inScope(s.tank.farmSection.farmId))) {
                throw new Error(`${lotCode} kodlu parti bulunamadı.`);
              }
              const since = new Date(Date.now() - 30 * DAY_MS);
              const [feed, deaths, samples, treatments] = await Promise.all([
                client.feedingEvent.aggregate({ where: { batchId: batch.id, occurredAt: { gte: since } }, _sum: { quantityKg: true } }),
                client.mortalityEvent.aggregate({ where: { batchId: batch.id, occurredAt: { gte: since } }, _sum: { fishCount: true } }),
                client.weightSample.findMany({
                  where: { batchId: batch.id },
                  orderBy: { occurredAt: "desc" },
                  take: 5,
                  select: { occurredAt: true, avgWeightG: true, sampleSize: true },
                }),
                client.treatment.findMany({
                  where: { batchId: batch.id, deletedAt: null },
                  orderBy: { startedAt: "desc" },
                  take: 5,
                  select: { productName: true, type: true, startedAt: true, endedAt: true, withdrawalPeriodDays: true },
                }),
              ]);
              return {
                lotCode: batch.lotCode,
                species: batch.species.name,
                status: batch.status,
                farmEntryDate: batch.farmEntryDate.toISOString().slice(0, 10),
                initialCount: batch.initialCount,
                initialAvgWeightG: Number(batch.initialAvgWeightG),
                targetFcr: batch.targetFcr === null ? null : Number(batch.targetFcr),
                liveCount: batch.currentState?.estimatedCount ?? 0,
                avgWeightG: Number(batch.currentState?.estimatedAvgWeightG ?? batch.initialAvgWeightG),
                biomassKg: round(Number(batch.currentState?.estimatedBiomassKg ?? 0), 0),
                where: batch.tankStates.map((s) => ({
                  farm: s.tank.farmSection.farm.name,
                  tank: s.tank.code,
                  fish: s.estimatedCount,
                })),
                last30Days: { feedKg: round(Number(feed._sum.quantityKg ?? 0), 1), deaths: deaths._sum.fishCount ?? 0 },
                lastWeighings: samples.map((w) => ({
                  date: w.occurredAt.toISOString().slice(0, 10),
                  avgWeightG: w.avgWeightG === null ? null : Number(w.avgWeightG),
                  sampleSize: w.sampleSize,
                })),
                treatments: treatments.map((t) => ({
                  product: t.productName,
                  type: t.type,
                  started: t.startedAt.toISOString().slice(0, 10),
                  ended: t.endedAt?.toISOString().slice(0, 10) ?? null,
                  withdrawalPeriodDays: t.withdrawalPeriodDays,
                })),
              };
            }),
        }),

      can(Permission.ALERT_READ) &&
        tool({
          name: "open_alerts",
          description:
            "The company's open alerts (newest first): type, severity, message, farm and tank, and when they were raised.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          run: () =>
            safely(async () => {
              const farms = new Map((await visibleFarms()).map((f) => [f.id, f.name]));
              const alerts = await client.alert.findMany({
                where: { status: "OPEN" },
                orderBy: { createdAt: "desc" },
                take: 50,
                include: { tank: { select: { code: true, farmSection: { select: { farmId: true } } } } },
              });
              return alerts
                .map((a) => ({ a, farmId: a.farmId ?? a.tank?.farmSection.farmId ?? null }))
                .filter(({ farmId }) => farmId === null || farms.has(farmId))
                .map(({ a, farmId }) => ({
                  type: a.type,
                  severity: a.severity,
                  message: a.message,
                  farm: farmId ? farms.get(farmId) : null,
                  tank: a.tank?.code ?? null,
                  raisedAt: a.createdAt.toISOString(),
                }));
            }),
        }),
    ];
    return tools.filter((t): t is AssistantTool => t !== false);
  }
}
