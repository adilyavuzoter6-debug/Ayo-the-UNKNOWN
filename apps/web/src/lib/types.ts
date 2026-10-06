import type { Role } from "@aquai/types";

/** Mirrors apps/api Prisma models — response shapes over the wire (dates as ISO strings). */

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string;
  timezone: string;
  planTier: "TRIAL" | "STARTER" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  trialEndsAt: string | null;
  createdAt: string;
}

export interface Farm {
  id: string;
  companyId: string;
  name: string;
  code: string;
  timezone: string | null;
  latitude: string | null;
  longitude: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface FarmSection {
  id: string;
  companyId: string;
  farmId: string;
  name: string;
  createdAt: string;
}

export type TankType = "TANK" | "POND" | "CAGE" | "RACEWAY";
export type TankStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";

export interface Tank {
  id: string;
  companyId: string;
  farmSectionId: string;
  code: string;
  type: TankType;
  volumeM3: string | null;
  maxBiomassKg: string | null;
  qrToken: string;
  status: TankStatus;
  createdAt: string;
}

export interface FishSpecies {
  id: string;
  companyId: string | null;
  name: string;
  strain: string | null;
  createdAt: string;
  /** Null = uses the app's default (trout-tuned) alert threshold instead. */
  criticalDoMgL: string | null;
  criticalPhLow: string | null;
  criticalPhHigh: string | null;
  criticalTempHighC: string | null;
}

export type BatchStatus = "ACTIVE" | "PARTIALLY_HARVESTED" | "HARVESTED" | "CLOSED";
export type MovementType =
  | "STOCKING"
  | "TRANSFER"
  | "SPLIT"
  | "MERGE"
  | "HARVEST_REMOVAL"
  | "ADJUSTMENT";

export interface BatchCurrentState {
  batchId: string;
  currentTankId: string | null;
  estimatedCount: number;
  estimatedAvgWeightG: string;
  estimatedBiomassKg: string;
  lastRecalculatedAt: string;
}

export type StockingSource = "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";

export interface FishBatch {
  id: string;
  companyId: string;
  lotCode: string;
  speciesId: string;
  hatcherySupplier: string | null;
  eggSource: string | null;
  hatchDate: string | null;
  farmEntryDate: string;
  initialCount: number;
  initialAvgWeightG: string;
  stockingSource: StockingSource | null;
  eggCount: number | null;
  stockingUnitPrice: string | null;
  stockingCurrency: string | null;
  stockingExchangeRate: string | null;
  status: BatchStatus;
  parentBatchIds: string[];
  createdAt: string;
  species: FishSpecies;
  currentState: BatchCurrentState | null;
}

export interface BatchTankAllocation {
  batchId: string;
  tankId: string;
  estimatedCount: number;
  lastRecalculatedAt: string;
  batch: FishBatch;
}

export interface BatchMovement {
  id: string;
  companyId: string;
  movementType: MovementType;
  batchId: string;
  fromTankId: string | null;
  toTankId: string | null;
  fromBatchId: string | null;
  toBatchId: string | null;
  fishCount: number;
  estimatedAvgWeightG: string | null;
  estimatedBiomassKg: string | null;
  occurredAt: string;
  postedAt: string;
  createdById: string;
  notes: string | null;
  reversalOfId: string | null;
}

export interface BatchHistory {
  batchIds: string[];
  movements: BatchMovement[];
}

export type MortalityReason =
  | "UNKNOWN"
  | "DISEASE"
  | "OXYGEN"
  | "TEMPERATURE"
  | "TRANSFER_STRESS"
  | "PHYSICAL_DAMAGE"
  | "PREDATOR"
  | "FEED_RELATED"
  | "OTHER";

export interface MortalityEvent {
  id: string;
  companyId: string;
  tankId: string;
  batchId: string;
  fishCount: number;
  estimatedAvgWeightG: string | null;
  estimatedBiomassKg: string | null;
  reason: MortalityReason;
  occurredAt: string;
  createdById: string;
  notes: string | null;
  createdAt: string;
}

export type SampleMethod = "INDIVIDUAL" | "AGGREGATE";

export interface WeightSample {
  id: string;
  companyId: string;
  tankId: string;
  batchId: string;
  sampleMethod: SampleMethod;
  sampleSize: number;
  individualWeightsG: string[];
  totalWeightG: string;
  avgWeightG: string;
  minWeightG: string | null;
  maxWeightG: string | null;
  stdDevG: string | null;
  cv: string | null;
  occurredAt: string;
  createdById: string;
  notes: string | null;
  createdAt: string;
}

export interface FcrResult {
  methodology: string;
  periodStart: string;
  periodEnd: string;
  startBiomassKg: number;
  endBiomassKg: number;
  mortalityBiomassKg: number;
  harvestBiomassKg: number;
  feedConsumedKg: number;
  biomassGainKg: number;
  fcr: number | null;
  economic: {
    methodology: string;
    feedCostTry: number;
    feedUnpricedKg: number;
    feedCostPerKgGainTry: number | null;
    directCostPerKgGainTry: number | null;
  };
}

export interface SgrPoint {
  initialSampleId: string;
  finalSampleId: string;
  initialOccurredAt: string;
  finalOccurredAt: string;
  initialAvgWeightG: number;
  finalAvgWeightG: number;
  periodDays: number;
  sgrPctPerDay: number;
}

export interface BiomassSnapshot {
  id: string;
  companyId: string;
  batchId: string;
  tankId: string | null;
  snapshotDate: string;
  estimatedCount: number;
  avgWeightG: string;
  biomassKg: string;
  methodology: string;
  createdById: string;
  createdAt: string;
}

export type ReadingSource = "MANUAL" | "SENSOR";

export interface WaterQualityReading {
  id: string;
  companyId: string;
  tankId: string;
  source: ReadingSource;
  sensorId: string | null;
  temperatureC: string | null;
  dissolvedOxygenMgL: string | null;
  ph: string | null;
  salinityPpt: string | null;
  ammoniaMgL: string | null;
  nitriteMgL: string | null;
  nitrateMgL: string | null;
  flowRateM3H: string | null;
  occurredAt: string;
  createdById: string | null;
  notes: string | null;
  createdAt: string;
  /** Derived server-side (Weiss 1970) — null if temperature or DO wasn't recorded. */
  dissolvedOxygenSaturationPct: number | null;
}

export type HarvestType = "PLANNED" | "ACTUAL";
export type HarvestFullness = "PARTIAL" | "FULL";

export interface HarvestRecord {
  id: string;
  companyId: string;
  batchId: string;
  tankId: string;
  type: HarvestType;
  fullness: HarvestFullness;
  plannedDate: string | null;
  harvestedAt: string | null;
  fishCount: number | null;
  biomassKg: string | null;
  avgWeightG: string | null;
  sizeGrade: string | null;
  destination: string | null;
  customer: string | null;
  processingPlant: string | null;
  salePricePerKg: string | null;
  saleCurrency: string | null;
  saleExchangeRate: string | null;
  saleRevenueTry: string | null;
  createdById: string;
  notes: string | null;
  createdAt: string;
}

export type TreatmentType = "MEDICATION" | "VACCINATION";

export interface Treatment {
  id: string;
  companyId: string;
  batchId: string;
  tankId: string;
  type: TreatmentType;
  productName: string;
  dosage: string | null;
  withdrawalPeriodDays: number | null;
  startedAt: string;
  endedAt: string | null;
  veterinarianId: string | null;
  createdById: string;
  notes: string | null;
  createdAt: string;
}

export type CostCategory =
  | "FEED"
  | "EGGS"
  | "FINGERLINGS"
  | "MEDICINE"
  | "VACCINATION"
  | "LABOR"
  | "ELECTRICITY"
  | "OXYGEN"
  | "FUEL"
  | "TRANSPORTATION"
  | "OVERHEAD"
  | "DEPRECIATION"
  | "OTHER";

export interface CostEntry {
  id: string;
  companyId: string;
  category: CostCategory;
  amount: string;
  currency: string;
  exchangeRate: string | null;
  amountTry: string;
  farmId: string | null;
  tankId: string | null;
  batchId: string | null;
  incurredAt: string;
  sourceType: string | null;
  sourceId: string | null;
  createdById: string;
  notes: string | null;
  createdAt: string;
}

export interface CostSummaryBatchRow {
  batchId: string;
  lotCode: string;
  /** Batch-tagged costs plus the feed the batch consumed. */
  directCostTotal: number;
  feedCostTry: number;
  /** Kg eaten from lots with no unit cost — directCostTotal is a floor by this much. */
  feedUnpricedKg: number;
  /** This batch's share of farm-level costs (electricity, labor…), by kilogram-days. */
  allocatedFarmCostTry: number;
  fullCostTry: number;
  harvestedKg: number;
  directCostPerKg: number | null;
  /** TRY per kg produced by this batch up to the period end (cost to date ÷ kg produced). */
  unitCostPerKg: number | null;
  producedKg: number;
  revenueTry: number;
  avgSaleTryPerKg: number | null;
  /** Sales in the period minus the direct cost of this period's batch-tagged spending. */
  grossProfitTry: number | null;
  /** Sales minus the cost of the fish sold — the batch result to rely on. */
  netProfitTry: number | null;
  /** Cost of the fish this batch sold in the period (kg sold × unit cost). */
  cogsTry: number;
  mortalityKg: number;
  mortalityLossTry: number | null;
}

export interface CostSummary {
  periodStart: string;
  periodEnd: string;
  /** TRY, all costs in the period. */
  totalAmount: number;
  byCategory: Partial<Record<CostCategory, number>>;
  farmLevelCostTry: number;
  allocatedFarmCostTry: number;
  unallocatedFarmCostTry: number;
  /** TRY, from harvests with a sale price in the period. */
  revenueTry: number;
  /** Cost of the fish sold in the period. */
  cogsTry: number;
  /** Sales − cost of fish sold − unallocated farm-level cost. */
  periodResultTry: number;
  /** Estimate — see CostsService.getCostSummary. */
  mortalityLossTry: number;
  batchBreakdown: CostSummaryBatchRow[];
}

export interface RecurringCost {
  id: string;
  farmId: string;
  category: CostCategory;
  amount: string;
  currency: string;
  dayOfMonth: number;
  startDate: string;
  generatedThrough: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CostForecastBatchRow {
  batchId: string;
  lotCode: string;
  liveCount: number;
  liveBiomassKg: number;
  avgWeightG: number;
  targetBiomassKg: number;
  biomassGainKg: number;
  feedKgNeeded: number;
  sunkCostTry: number;
  feedCostTry: number | null;
  totalCostTry: number | null;
  costPerKgTry: number | null;
  revenueTry: number | null;
  resultTry: number | null;
}

export interface CostForecast {
  assumptions: {
    targetWeightG: number;
    targetFcr: number;
    survivalPct: number;
    feedPriceTryPerKg: number | null;
    feedPriceSource: "input" | "recent_consumption" | "latest_lot" | null;
    expectedSaleTryPerKg: number | null;
    note: string;
  };
  batches: CostForecastBatchRow[];
  totals: {
    feedKgNeeded: number;
    feedCostTry: number | null;
    totalCostTry: number | null;
    revenueTry: number | null;
    resultTry: number | null;
  };
}

export type ExchangeCurrency = "TRY" | "USD" | "EUR";
export type ForeignCurrency = Exclude<ExchangeCurrency, "TRY">;

export interface ForeignRate {
  date: string;
  rate: number;
  bulletinDate: string;
}

export interface FeedProduct {
  id: string;
  companyId: string;
  name: string;
  manufacturer: string | null;
  pelletSizeMm: string | null;
  proteinPct: string | null;
  fatPct: string | null;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  companyId: string;
  farmId: string;
  name: string;
  createdAt: string;
}

export interface FeedInventoryBalance {
  feedInventoryBatchId: string;
  quantityOnHandKg: string;
  lastRecalculatedAt: string;
}

export interface FeedInventoryBatch {
  id: string;
  companyId: string;
  warehouseId: string;
  feedProductId: string;
  supplierLotCode: string | null;
  manufactureDate: string | null;
  expiryDate: string | null;
  unitCostPerKg: string | null;
  createdAt: string;
  warehouse: Warehouse;
  feedProduct: FeedProduct;
  balance: FeedInventoryBalance | null;
}

export type InventoryTxType =
  | "PURCHASE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "FEED_CONSUMPTION"
  | "ADJUSTMENT"
  | "RETURN"
  | "WASTE";

export interface FeedInventoryTransaction {
  id: string;
  companyId: string;
  warehouseId: string;
  feedInventoryBatchId: string;
  type: InventoryTxType;
  quantityKg: string;
  occurredAt: string;
  createdById: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export type FeedingMethod = "MANUAL" | "AUTOMATIC_FEEDER" | "DEMAND_FEEDER";

export interface FeedingEvent {
  id: string;
  companyId: string;
  tankId: string;
  batchId: string;
  feedProductId: string;
  quantityKg: string;
  method: FeedingMethod;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
  feedProduct: FeedProduct;
}

export type AlertType =
  | "BIOMASS_CAPACITY"
  | "LOW_FEED_STOCK"
  | "MORTALITY_SPIKE"
  | "MISSING_DAILY_RECORDS"
  | "WATER_QUALITY_CRITICAL"
  | "MANUAL";
export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH";
export type AlertStatus = "OPEN" | "RESOLVED";

export interface Alert {
  id: string;
  companyId: string;
  farmId: string | null;
  tankId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
}

export interface FarmDashboardKpis {
  biomassKg: number;
  fishCount: number;
  activeBatchesCount: number;
  avgFcr: number | null;
  avgSgrPctPerDay: number | null;
  mortalityRate7dPct: number;
  todayFeedKg: number;
  openAlertsCount: number;
}

export interface FarmOverviewRow {
  farm: Farm;
  summary: FarmStockSummary;
}

export interface FarmStockSummary {
  facilities: number;
  pools: number;
  fishCount: number;
  biomassKg: number;
  todayFeedKg: number;
  openAlertsCount: number;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

export interface Invitation {
  id: string;
  companyId: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  createdAt: string;
  expiresAt: string;
}

export interface AuditLogEntry {
  id: string;
  companyId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
}

export interface MinMaxAvg {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface InspectionReport {
  farm: { id: string; name: string; code: string };
  periodStart: string;
  periodEnd: string;
  tankCount: number;
  activeBatches: {
    tankCode: string;
    lotCode: string;
    speciesName: string;
    estimatedCount: number;
    avgWeightG: number;
  }[];
  mortality: { total: number; byReason: Record<string, number> };
  treatments: {
    productName: string;
    type: TreatmentType;
    startedAt: string;
    endedAt: string | null;
    withdrawalPeriodDays: number | null;
  }[];
  waterQuality: {
    temperatureC: MinMaxAvg | null;
    dissolvedOxygenMgL: MinMaxAvg | null;
    ph: MinMaxAvg | null;
    readingCount: number;
  };
  harvestRecords: {
    harvestedAt: string | null;
    fishCount: number | null;
    biomassKg: number | null;
    destination: string | null;
  }[];
  totalFeedKg: number;
}

/** Platform-admin console (cross-tenant, PLATFORM_ADMIN only). */
export interface AdminCompanyRow {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string;
  planTier: Company["planTier"];
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
  memberCount: number;
  farmCount: number;
  activeBatchCount: number;
  liveFishCount: number;
  liveBiomassKg: number;
  avgWeightG: number | null;
  harvestedBiomassKg: number;
  harvestedFishCount: number;
}

export interface AdminCompanyDetail {
  company: {
    id: string;
    name: string;
    legalName: string | null;
    countryCode: string;
    timezone: string;
    planTier: Company["planTier"];
    status: string;
    trialEndsAt: string | null;
    createdAt: string;
  };
  members: {
    id: string;
    role: Role;
    joinedAt: string | null;
    email: string;
    fullName: string;
  }[];
  farms: { id: string; name: string; code: string; status: string; sectionCount: number }[];
  batches: {
    id: string;
    lotCode: string;
    status: BatchStatus;
    speciesName: string;
    farmEntryDate: string;
    initialCount: number;
    liveCount: number;
    avgWeightG: number | null;
    biomassKg: number;
  }[];
  harvests: {
    id: string;
    harvestedAt: string | null;
    lotCode: string;
    fishCount: number | null;
    biomassKg: number | null;
    avgWeightG: number | null;
    customer: string | null;
  }[];
}

// Target-weight cost projection (API: modules/cost-scenarios). Estimates only: nothing here is booked.
export type ProjectionMode = "SIMPLE" | "STAGED";
export type ExpenseMode = "TOTAL" | "DAILY";

export interface ScenarioExpenseInput {
  label: string;
  amountTry: number;
  mode: ExpenseMode;
}

export interface ScenarioStageInput {
  minG?: number;
  maxG?: number;
  feedPriceTryPerKg?: number;
  fcr?: number;
  durationDays?: number;
  mortalityPct?: number;
}

export interface ScenarioInput {
  startCount?: number;
  startAvgWeightG?: number;
  startAccumulatedCostTry?: number;
  targetWeightG?: number;
  mode: ProjectionMode;
  feedPriceTryPerKg?: number;
  fcr?: number;
  durationDays?: number;
  sgrPctPerDay?: number;
  mortalityPct?: number;
  stages?: ScenarioStageInput[];
  expenses: ScenarioExpenseInput[];
}

export interface ScenarioStageBreakdown {
  fromG: number;
  toG: number;
  days: number;
  feedKg: number;
  feedCostTry: number;
  fcr: number;
  feedPriceTryPerKg: number;
  mortalityPct: number;
}

export interface ScenarioResult {
  targetWeightG: number;
  days: number;
  durationSource: "MANUAL" | "SGR" | "STAGED";
  startCount: number;
  aliveAtTarget: number;
  deadCount: number;
  startBiomassKg: number;
  targetBiomassKg: number;
  netBiomassChangeKg: number;
  growthKg: number;
  feedKg: number;
  feedCostTry: number;
  expenses: { label: string; mode: ExpenseMode; amountTry: number }[];
  expensesTry: number;
  additionalCostTry: number;
  startAccumulatedCostTry: number;
  totalCostTry: number;
  costPerFishTry: number | null;
  costPerKgTry: number | null;
  stages: ScenarioStageBreakdown[];
  warnings: string[];
}

export type ScenarioOutcome = { ok: true; result: ScenarioResult } | { ok: false; error: string };

export interface ScenarioPrefill {
  batchId: string;
  lotCode: string;
  tankId: string | null;
  startCount: number;
  startAvgWeightG: number;
  startAccumulatedCostTry: number;
  sgrPctPerDay: number | null;
  feedPriceTryPerKg: number | null;
  feedPriceSource: "LAST_PURCHASE" | null;
}

export interface SavedCostScenario {
  id: string;
  name: string;
  batchId: string | null;
  tankId: string | null;
  input: ScenarioInput;
  createdAt: string;
}
