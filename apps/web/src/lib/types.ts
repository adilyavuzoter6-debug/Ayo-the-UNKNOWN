import type { Role } from "@aquai/types";

/** Mirrors apps/api Prisma models — response shapes over the wire (dates as ISO strings). */

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string;
  timezone: string;
  planTier: "TRIAL" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
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
  createdById: string;
  notes: string | null;
  createdAt: string;
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
