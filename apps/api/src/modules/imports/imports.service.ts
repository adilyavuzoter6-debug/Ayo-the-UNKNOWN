import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { TankType } from "@prisma/client";
import { PLAN_LABEL, PLAN_LIMITS } from "@aquai/types";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { usableTimeZone } from "../../common/utils/time-zone";
import type { TenantContext } from "../../common/types/request-context";
import { AuditService } from "../audit/audit.service";
import { FeedInventoryProjectionService } from "../feed-inventory/feed-inventory-projection.service";
import { BatchProjectionService } from "../fish-batches/batch-projection.service";
import {
  normalize,
  readImportWorkbook,
  type BatchRow,
  type FeedingRow,
  type HarvestRow,
  type ImportKind,
  type ImportRow,
  type MortalityRow,
  type RowError,
  type SheetDate,
  type TransferRow,
  type TreatmentRow,
  type WaterRow,
  type WeighingRow,
} from "./import-sheets";

/** What a file may hold: enough for years of a large farm's records, bounded for one request. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 50_000;
const ERRORS_SHOWN = 200;
const CODE = /^[A-Z0-9_-]{1,20}$/i;
const KINDS: ImportKind[] = ["farm", "tank", "batch", "feeding", "mortality", "weighing", "water", "harvest", "transfer", "treatment"];

export interface UploadedSheetFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface ImportPreview {
  fileName: string;
  /** Rows that would be written, per kind. */
  counts: Record<ImportKind, number>;
  /** Rows already in the app (an earlier import of the same file, an existing farm code), left out. */
  skipped: number;
  errorCount: number;
  errors: RowError[];
  ignoredSheets: string[];
  /** What the import does to each batch's live count, so a wrong file shows before it's written. */
  batches: { lotCode: string; isNew: boolean; deaths: number; harvested: number; weighings: number; liveNow: number; liveAfter: number }[];
}

/** A record row matched to its tank at the moment it stands for. */
type At<R> = R & { tankId: string; occurredAt: Date };
/** …and to its batch. */
type OfBatch<R> = At<R> & { batchId: string };

interface TankInfo {
  id: string;
  code: string;
  farmId: string;
  farmCode: string;
}
interface BatchInfo {
  id: string;
  lotCode: string;
  farmEntryDate: Date;
  initialAvgWeightG: number;
  /** Live fish per tank before this import. */
  liveNow: Map<string, number>;
  isNew: boolean;
}

interface Plan {
  farms: { id: string; code: string; name: string }[];
  sections: { id: string; farmId: string; name: string }[];
  tanks: { id: string; farmSectionId: string; code: string; type: TankType; volumeM3?: number; maxBiomassKg?: number }[];
  batches: (At<BatchRow> & { id: string; speciesId: string })[];
  transfers: (OfBatch<TransferRow> & { toTankId: string })[];
  feeding: (OfBatch<FeedingRow> & { feedProductId: string; warehouseId: string })[];
  mortality: (OfBatch<MortalityRow> & { avgWeightG: number })[];
  weighing: OfBatch<WeighingRow>[];
  water: At<WaterRow>[];
  harvest: (OfBatch<HarvestRow> & { avgWeightG: number; biomassKg: number })[];
  treatment: OfBatch<TreatmentRow>[];
  skipped: number;
  errors: RowError[];
  ignoredSheets: string[];
  effects: ImportPreview["batches"];
}

type RecordKind = "feeding" | "mortality" | "weighing" | "water" | "harvest" | "transfer" | "treatment";

/** A cuid-shaped id, so rows created here look like the rest and their ids are known before writing. */
function newId(): string {
  return `c${BigInt(`0x${randomBytes(16).toString("hex")}`).toString(36).padStart(24, "0").slice(-24)}`;
}

/**
 * Brings a farm in from Excel: its structure (farms, tanks, batches) and its history (feeding,
 * mortality, weighings, water quality, harvests, transfers, treatments), written as if recorded in
 * the app on their dates, so a new customer's dashboards, forecasts and reports work from day one.
 * A file is checked whole first; it is written only if every row is understood, and then in one
 * transaction, every row tagged with its DataImport so the import can be undone as a whole.
 *
 * Unlike recording a day in the app, an import raises no alerts or e-mails and doesn't stop a
 * harvest for a withdrawal period (it is history), and its feeding leaves today's feed stock alone:
 * each feed comes in on an import lot as an opening adjustment and goes out as the consumption
 * recorded, netting to zero.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly feedProjection: FeedInventoryProjectionService,
    private readonly batchProjection: BatchProjectionService,
  ) {}

  async preview(tenant: TenantContext, file: UploadedSheetFile | undefined): Promise<ImportPreview> {
    const { fileName, plan } = await this.read(tenant, file);
    return summarize(fileName, plan);
  }

  async commit(tenant: TenantContext, userId: string, file: UploadedSheetFile | undefined) {
    const { fileName, plan } = await this.read(tenant, file);
    const summary = summarize(fileName, plan);
    if (summary.errorCount > 0) {
      throw new BadRequestException(
        `Dosyada ${summary.errorCount} satır okunamadı ya da eşleştirilemedi; önce bunları düzeltin. Hiçbir kayıt yazılmadı.`,
      );
    }
    if (KINDS.every((k) => summary.counts[k] === 0)) {
      throw new BadRequestException("Dosyada yazılacak yeni kayıt yok.");
    }

    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const companyId = tenant.companyId;
    const counts = { ...summary.counts, skipped: summary.skipped };
    const importId = newId();
    const tag = { importId };
    const by = { createdById: userId };
    const lotIds: string[] = [];

    await client.$transaction(
      async (tx) => {
        await tx.dataImport.create({ data: { id: importId, companyId, userId, fileName, counts } });

        await tx.farm.createMany({ data: plan.farms.map((f) => ({ ...f, companyId, ...tag })) });
        await tx.farmSection.createMany({ data: plan.sections.map((s) => ({ ...s, companyId, ...tag })) });
        await tx.tank.createMany({ data: plan.tanks.map((t) => ({ ...t, companyId, ...tag })) });
        await tx.fishBatch.createMany({
          data: plan.batches.map((b) => ({
            id: b.id,
            companyId,
            lotCode: b.lotCode,
            speciesId: b.speciesId,
            hatcherySupplier: b.supplier,
            farmEntryDate: b.occurredAt,
            initialCount: b.fishCount,
            initialAvgWeightG: b.avgWeightG,
            targetFcr: b.targetFcr,
            ...by,
            ...tag,
          })),
        });
        await tx.batchMovement.createMany({
          data: [
            ...plan.batches.map((b) => ({
              companyId,
              movementType: "STOCKING" as const,
              batchId: b.id,
              toTankId: b.tankId,
              fishCount: b.fishCount,
              estimatedAvgWeightG: b.avgWeightG,
              estimatedBiomassKg: (b.fishCount * b.avgWeightG) / 1000,
              occurredAt: b.occurredAt,
              notes: b.notes,
              ...by,
              ...tag,
            })),
            ...plan.transfers.map((t) => ({
              companyId,
              movementType: "TRANSFER" as const,
              batchId: t.batchId,
              fromTankId: t.tankId,
              toTankId: t.toTankId,
              fishCount: t.fishCount,
              occurredAt: t.occurredAt,
              notes: t.notes,
              ...by,
              ...tag,
            })),
          ],
        });

        // Feeding: per warehouse, feed and price, an import lot that receives what the history consumed.
        const lots = new Map<string, typeof plan.feeding>();
        for (const row of plan.feeding) {
          const key = `${row.warehouseId}|${row.feedProductId}|${row.unitPriceTry ?? ""}`;
          lots.set(key, [...(lots.get(key) ?? []), row]);
        }
        const reference = { referenceType: "DataImport", referenceId: importId };
        for (const rows of lots.values()) {
          const { warehouseId, feedProductId, unitPriceTry } = rows[0]!;
          const lot = await tx.feedInventoryBatch.create({
            data: { companyId, warehouseId, feedProductId, supplierLotCode: "Excel içe aktarımı", unitCostPerKg: unitPriceTry, ...by, ...tag },
          });
          lotIds.push(lot.id);
          await tx.feedInventoryTransaction.create({
            data: {
              companyId,
              warehouseId,
              feedInventoryBatchId: lot.id,
              type: "ADJUSTMENT",
              quantityKg: rows.reduce((sum, r) => sum + r.quantityKg, 0),
              occurredAt: new Date(Math.min(...rows.map((r) => r.occurredAt.getTime()))),
              notes: "Excel içe aktarımı: geçmiş yemlemelerin açılış stoku",
              ...reference,
              ...by,
              ...tag,
            },
          });
          const consumptions = rows.map((row) => ({
            id: newId(),
            companyId,
            warehouseId,
            feedInventoryBatchId: lot.id,
            type: "FEED_CONSUMPTION" as const,
            quantityKg: row.quantityKg,
            occurredAt: row.occurredAt,
            ...reference,
            ...by,
            ...tag,
          }));
          await tx.feedInventoryTransaction.createMany({ data: consumptions });
          await tx.feedingEvent.createMany({
            data: rows.map((row, i) => ({
              companyId,
              tankId: row.tankId,
              batchId: row.batchId,
              feedProductId,
              quantityKg: row.quantityKg,
              occurredAt: row.occurredAt,
              notes: row.notes,
              inventoryTransactionId: consumptions[i]!.id,
              ...by,
              ...tag,
            })),
          });
        }

        await tx.mortalityEvent.createMany({
          data: plan.mortality.map((row) => ({
            companyId,
            tankId: row.tankId,
            batchId: row.batchId,
            fishCount: row.fishCount,
            estimatedAvgWeightG: row.avgWeightG,
            estimatedBiomassKg: (row.fishCount * row.avgWeightG) / 1000,
            reason: row.reason,
            occurredAt: row.occurredAt,
            notes: row.notes,
            ...by,
            ...tag,
          })),
        });
        await tx.weightSample.createMany({
          data: plan.weighing.map((row) => ({
            companyId,
            tankId: row.tankId,
            batchId: row.batchId,
            sampleMethod: "AGGREGATE" as const,
            sampleSize: row.sampleSize,
            totalWeightG: row.avgWeightG * row.sampleSize,
            avgWeightG: row.avgWeightG,
            occurredAt: row.occurredAt,
            notes: row.notes,
            ...by,
            ...tag,
          })),
        });
        await tx.waterQualityReading.createMany({
          data: plan.water.map((row) => ({
            companyId,
            tankId: row.tankId,
            source: "MANUAL" as const,
            ...row.metrics,
            occurredAt: row.occurredAt,
            notes: row.notes,
            ...by,
            ...tag,
          })),
        });

        // An actual harvest is a record plus the fish leaving the tank, as in the app.
        const harvests = plan.harvest.map((row) => ({ id: newId(), row }));
        await tx.harvestRecord.createMany({
          data: harvests.map(({ id, row }) => ({
            id,
            companyId,
            batchId: row.batchId,
            tankId: row.tankId,
            type: "ACTUAL" as const,
            fullness: row.full ? ("FULL" as const) : ("PARTIAL" as const),
            harvestedAt: row.occurredAt,
            fishCount: row.fishCount,
            biomassKg: row.biomassKg,
            avgWeightG: row.avgWeightG,
            customer: row.customer,
            ...(row.unitPriceTry === undefined
              ? {}
              : {
                  salePricePerKg: row.unitPriceTry,
                  saleCurrency: "TRY",
                  saleExchangeRate: 1,
                  saleRevenueTry: Math.round(row.biomassKg * row.unitPriceTry * 100) / 100,
                }),
            notes: row.notes,
            ...by,
            ...tag,
          })),
        });
        await tx.batchMovement.createMany({
          data: harvests.map(({ id, row }) => ({
            companyId,
            movementType: "HARVEST_REMOVAL" as const,
            batchId: row.batchId,
            fromTankId: row.tankId,
            fishCount: row.fishCount,
            estimatedAvgWeightG: row.avgWeightG,
            estimatedBiomassKg: row.biomassKg,
            occurredAt: row.occurredAt,
            notes: `Harvest ${id}`,
            ...by,
            ...tag,
          })),
        });
        await tx.treatment.createMany({
          data: plan.treatment.map((row) => ({
            companyId,
            batchId: row.batchId,
            tankId: row.tankId,
            type: row.treatmentType,
            productName: row.productName,
            dosage: row.dosage,
            withdrawalPeriodDays: row.withdrawalDays,
            startedAt: row.occurredAt,
            endedAt: row.endDate ? noonUtc(row.endDate) : undefined,
            notes: row.notes,
            ...by,
            ...tag,
          })),
        });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    await this.recompute(tenant.companyId, lotIds, [
      ...plan.batches.map((r) => r.id),
      ...[plan.transfers, plan.feeding, plan.mortality, plan.weighing, plan.harvest, plan.treatment].flat().map((r) => r.batchId),
    ]);
    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "DataImport",
      entityId: importId,
      newValue: { fileName, ...counts },
    });
    return { id: importId, ...summary };
  }

  async list(tenant: TenantContext) {
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const imports = await client.dataImport.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    const users = await client.companyMembership.findMany({
      where: { userId: { in: [...new Set(imports.map((i) => i.userId))] } },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    const nameOf = new Map(users.map((m) => [m.userId, m.user.fullName]));
    return imports.map((i) => ({ ...i, userName: nameOf.get(i.userId) ?? null }));
  }

  /** Removes everything one import wrote and puts the other batches back as they were without it. */
  async undo(tenant: TenantContext, userId: string, importId: string) {
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const found = await client.dataImport.findFirst({ where: { id: importId } });
    if (!found) throw new NotFoundException("İçe aktarım bulunamadı.");
    if (found.undoneAt) throw new ConflictException("Bu içe aktarım zaten geri alınmış.");

    const tag = { importId };
    const ids = { where: tag, select: { id: true } } as const;
    const batchOf = { where: tag, select: { batchId: true } as const, distinct: ["batchId"] as "batchId"[] };
    const [lots, newBatches, newTanks, ...touched] = await Promise.all([
      client.feedInventoryBatch.findMany(ids),
      client.fishBatch.findMany(ids),
      client.tank.findMany(ids),
      client.batchMovement.findMany(batchOf),
      client.feedingEvent.findMany(batchOf),
      client.mortalityEvent.findMany(batchOf),
      client.weightSample.findMany(batchOf),
      client.harvestRecord.findMany(batchOf),
      client.treatment.findMany(batchOf),
    ]);
    const lotIds = lots.map((l) => l.id);
    const newBatchIds = newBatches.map((b) => b.id);
    const newTankIds = newTanks.map((t) => t.id);
    try {
      await client.$transaction(async (tx) => {
        await tx.treatment.deleteMany({ where: tag });
        await tx.harvestRecord.deleteMany({ where: tag });
        await tx.feedingEvent.deleteMany({ where: tag });
        await tx.feedInventoryTransaction.deleteMany({ where: tag });
        await tx.feedInventoryBalance.deleteMany({ where: { feedInventoryBatchId: { in: lotIds } } });
        await tx.feedInventoryBatch.deleteMany({ where: tag });
        await tx.mortalityEvent.deleteMany({ where: tag });
        await tx.weightSample.deleteMany({ where: tag });
        await tx.waterQualityReading.deleteMany({ where: tag });
        await tx.batchMovement.deleteMany({ where: tag });
        // The projections of what the import created go with it; the other batches' are rebuilt below.
        await tx.batchTankState.deleteMany({ where: { OR: [{ batchId: { in: newBatchIds } }, { tankId: { in: newTankIds } }] } });
        await tx.batchCurrentState.deleteMany({ where: { batchId: { in: newBatchIds } } });
        await tx.fishBatch.deleteMany({ where: tag });
        await tx.tank.deleteMany({ where: tag });
        await tx.farmSection.deleteMany({ where: tag });
        await tx.farm.deleteMany({ where: tag });
        await tx.dataImport.updateMany({ where: { id: importId }, data: { undoneAt: new Date() } });
      });
    } catch {
      // What can hold it: something recorded since on a farm, tank, batch or feed lot the import created.
      throw new ConflictException(
        "Bu içe aktarımın oluşturduğu çiftlik, tank, parti ya da yem stoğuna sonradan kayıt girilmiş; geri alınamıyor. " +
          "Önce o kayıtları silin ya da destek ekibiyle iletişime geçin.",
      );
    }
    const removed = new Set(newBatchIds);
    await this.recompute(
      tenant.companyId,
      [],
      touched
        .flat()
        .map((t) => t.batchId)
        .filter((id) => !removed.has(id)),
    );
    await this.auditService.record({
      companyId: tenant.companyId,
      userId,
      action: "DELETE",
      entityType: "DataImport",
      entityId: importId,
      previousValue: found.counts,
    });
    return { id: importId, undone: true };
  }

  private async recompute(companyId: string, lotIds: string[], batchIds: string[]) {
    for (const lotId of lotIds) await this.feedProjection.recompute(companyId, lotId);
    for (const batchId of new Set(batchIds)) await this.batchProjection.recompute(companyId, batchId);
  }

  private async read(tenant: TenantContext, file: UploadedSheetFile | undefined) {
    if (!file) throw new BadRequestException("Bir Excel dosyası seçin.");
    // Multer reads multipart file names as Latin-1; browsers send UTF-8 ("Yemleme_Şubat.xlsx").
    const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
    if (!/\.xlsx$/i.test(fileName)) {
      throw new BadRequestException("Yalnızca .xlsx dosyaları okunabilir. Eski .xls dosyasını Excel'de .xlsx olarak kaydedin.");
    }
    let sheets: { sheet: string; data: unknown[][] }[];
    try {
      const { default: readXlsxFile } = await import("read-excel-file/node");
      sheets = (await readXlsxFile(file.buffer)) as unknown as { sheet: string; data: unknown[][] }[];
    } catch {
      throw new BadRequestException("Dosya okunamadı. Geçerli bir Excel (.xlsx) dosyası yükleyin.");
    }
    const read = readImportWorkbook(sheets);
    if (read.rows.length + read.errors.length > MAX_ROWS) {
      throw new BadRequestException(
        `Bir dosyada en fazla ${MAX_ROWS.toLocaleString("tr")} satır içe aktarılabilir; dosyayı bölün.`,
      );
    }
    return { fileName, plan: await this.plan(tenant, read.rows, read.errors, read.ignoredSheets) };
  }

  /**
   * Matches every row to what it refers to — farms, tanks, batches and feeds already in the app or
   * created earlier in the same file — checks it, and leaves out what the app already has. The
   * order matters: structure first, then transfers (they decide which batch is in which tank),
   * then the rest; fish counts are checked last, against the whole file.
   */
  private async plan(tenant: TenantContext, rows: ImportRow[], readErrors: RowError[], ignoredSheets: string[]): Promise<Plan> {
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const plan: Plan = {
      farms: [],
      sections: [],
      tanks: [],
      batches: [],
      transfers: [],
      feeding: [],
      mortality: [],
      weighing: [],
      water: [],
      harvest: [],
      treatment: [],
      skipped: 0,
      errors: [...readErrors],
      ignoredSheets,
      effects: [],
    };
    if (rows.length === 0) return plan;
    const of = <K extends ImportKind>(kind: K) => rows.filter((r): r is Extract<ImportRow, { kind: K }> => r.kind === kind);

    const [membership, farms, sections, tanks, batches, species, products, warehouses] = await Promise.all([
      client.companyMembership.findFirst({
        where: { id: tenant.membershipId },
        select: { company: { select: { timezone: true } } },
      }),
      client.farm.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
      client.farmSection.findMany({ where: { deletedAt: null }, select: { id: true, farmId: true, name: true } }),
      client.tank.findMany({
        where: { deletedAt: null, farmSection: { farm: { deletedAt: null } } },
        select: { id: true, code: true, farmSection: { select: { farmId: true, farm: { select: { code: true } } } } },
      }),
      client.fishBatch.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          lotCode: true,
          farmEntryDate: true,
          initialAvgWeightG: true,
          tankStates: { select: { tankId: true, estimatedCount: true } },
        },
      }),
      this.tenantPrisma.findSpeciesForCompany(tenant.companyId),
      client.feedProduct.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      client.warehouse.findMany({ where: { deletedAt: null }, select: { id: true, farmId: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const timeZone = usableTimeZone(membership?.company.timezone);
    const localDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
    const now = Date.now();
    const scoped = tenant.farmScopeIds.length > 0;
    const fail = (row: { sheet: string; row: number }, message: string) => {
      plan.errors.push({ sheet: row.sheet, row: row.row, message });
      return null;
    };

    // ---------- structure: farms, sections, tanks ----------
    const farmByCode = new Map(farms.map((f) => [normalize(f.code), { id: f.id, code: f.code }]));
    const seenFarms = new Set<string>();
    for (const row of of("farm")) {
      const key = normalize(row.farmCode);
      if (!CODE.test(row.farmCode)) fail(row, "Çiftlik kodu yalnızca harf, rakam, - ve _ içerebilir (en fazla 20 karakter).");
      else if (seenFarms.has(key)) fail(row, `"${row.farmCode}" çiftlik kodu dosyada iki kez var.`);
      else if (farmByCode.has(key)) plan.skipped += 1;
      else if (scoped) fail(row, "Yeni çiftlik ekleme yetkiniz yok; yalnızca size atanmış çiftliklerde çalışabilirsiniz.");
      else {
        const farm = { id: newId(), code: row.farmCode.toUpperCase(), name: row.farmName };
        plan.farms.push(farm);
        farmByCode.set(key, farm);
      }
      seenFarms.add(key);
    }

    const allSections = [...sections];
    const allTanks: TankInfo[] = tanks.map((t) => ({ id: t.id, code: t.code, farmId: t.farmSection.farmId, farmCode: t.farmSection.farm.code }));
    const fileTanks = new Set<string>();
    for (const row of of("tank")) {
      const farm = farmByCode.get(normalize(row.farmCode));
      if (!farm) {
        fail(row, `"${row.farmCode}" kodlu çiftlik yok; Çiftlikler sekmesine ekleyin ya da kodu uygulamadaki gibi yazın.`);
        continue;
      }
      if (scoped && !tenant.farmScopeIds.includes(farm.id)) {
        fail(row, `"${row.farmCode}" çiftliğine erişiminiz yok.`);
        continue;
      }
      if (!CODE.test(row.tankCode)) {
        fail(row, "Tank kodu yalnızca harf, rakam, - ve _ içerebilir (en fazla 20 karakter).");
        continue;
      }
      const key = `${farm.id}|${normalize(row.tankCode)}`;
      if (fileTanks.has(key)) {
        fail(row, `"${row.tankCode}" tank kodu bu çiftlik için dosyada iki kez var.`);
        continue;
      }
      fileTanks.add(key);
      if (allTanks.some((t) => t.farmId === farm.id && normalize(t.code) === normalize(row.tankCode))) {
        plan.skipped += 1;
        continue;
      }
      const inFarm = allSections.filter((s) => s.farmId === farm.id);
      let section = row.sectionName ? inFarm.find((s) => normalize(s.name) === normalize(row.sectionName!)) : inFarm[0];
      if (!row.sectionName && inFarm.length > 1) {
        fail(row, `"${row.farmCode}" çiftliğinde birden fazla bölüm var; "Bölüm" sütununu doldurun.`);
        continue;
      }
      if (!section) {
        section = { id: newId(), farmId: farm.id, name: row.sectionName ?? "Genel" };
        plan.sections.push(section);
        allSections.push(section);
      }
      const tank = {
        id: newId(),
        farmSectionId: section.id,
        code: row.tankCode.toUpperCase(),
        type: row.tankType,
        volumeM3: row.volumeM3,
        maxBiomassKg: row.maxBiomassKg,
      };
      plan.tanks.push(tank);
      allTanks.push({ id: tank.id, code: tank.code, farmId: farm.id, farmCode: farm.code });
    }

    // The plan's farm and tank limits hold for imports as for the app.
    const limits = PLAN_LIMITS[tenant.planTier];
    const overLimit = (noun: string, existing: number, added: { sheet: string; row: number }[], max: number | null) => {
      if (max === null || existing + added.length <= max) return;
      fail(
        added[Math.max(0, max - existing)]!,
        `${PLAN_LABEL[tenant.planTier]} planı en fazla ${max} ${noun} izin veriyor; planınızı yükseltin.`,
      );
    };
    overLimit("çiftliğe", farms.length, of("farm").filter((r) => plan.farms.some((f) => f.code === r.farmCode.toUpperCase())), limits.maxFarms);
    overLimit("tanka", tanks.length, of("tank").filter((r) => plan.tanks.some((t) => t.code === r.tankCode.toUpperCase())), limits.maxTanks);

    const tanksByCode = new Map<string, TankInfo[]>();
    for (const t of allTanks) tanksByCode.set(normalize(t.code), [...(tanksByCode.get(normalize(t.code)) ?? []), t]);
    const resolveTank = (row: { sheet: string; row: number; tankCode: string; farmCode?: string }, which = "") => {
      const candidates = tanksByCode.get(normalize(row.tankCode)) ?? [];
      const inFarm = row.farmCode ? candidates.filter((t) => normalize(t.farmCode) === normalize(row.farmCode!)) : candidates;
      if (candidates.length === 0) return fail(row, `"${row.tankCode}" kodlu ${which}tank bulunamadı.`);
      if (inFarm.length === 0) return fail(row, `"${row.farmCode}" çiftliğinde "${row.tankCode}" kodlu tank yok.`);
      if (inFarm.length > 1) {
        return fail(row, `"${row.tankCode}" kodlu tank birden fazla çiftlikte var; çiftlik kodu sütununu doldurun.`);
      }
      if (scoped && !tenant.farmScopeIds.includes(inFarm[0]!.farmId)) return fail(row, `"${row.tankCode}" tankına erişiminiz yok.`);
      return inFarm[0]!;
    };
    const instant = (row: { sheet: string; row: number; date: SheetDate }) => {
      const at = toInstant(row.date, timeZone);
      if (at.getTime() > now + 60 * 60 * 1000) return fail(row, "Tarih ileride; yalnızca geçmiş kayıtlar içe aktarılabilir.");
      return at;
    };

    // ---------- structure: batches ----------
    const allBatches: BatchInfo[] = batches.map((b) => ({
      id: b.id,
      lotCode: b.lotCode,
      farmEntryDate: b.farmEntryDate,
      initialAvgWeightG: Number(b.initialAvgWeightG),
      liveNow: new Map(b.tankStates.map((s) => [s.tankId, s.estimatedCount])),
      isNew: false,
    }));
    const batchByLot = new Map(allBatches.map((b) => [b.lotCode.toLocaleUpperCase("tr"), b]));
    const speciesByName = new Map<string, string[]>();
    for (const s of species) {
      for (const name of [s.name, s.strain ? `${s.name} ${s.strain}` : null]) {
        if (name) speciesByName.set(normalize(name), [...(speciesByName.get(normalize(name)) ?? []), s.id]);
      }
    }
    const seenLots = new Set<string>();
    for (const row of of("batch")) {
      const key = row.lotCode.toLocaleUpperCase("tr");
      if (seenLots.has(key)) {
        fail(row, `"${row.lotCode}" parti kodu dosyada iki kez var.`);
        continue;
      }
      seenLots.add(key);
      if (batchByLot.has(key)) {
        plan.skipped += 1;
        continue;
      }
      const speciesIds = speciesByName.get(normalize(row.speciesName)) ?? [];
      if (speciesIds.length !== 1) {
        fail(
          row,
          speciesIds.length === 0
            ? `"${row.speciesName}" adlı balık türü yok; Ayarlar → Balık türleri'nden ekleyin ya da adı uygulamadaki gibi yazın.`
            : `"${row.speciesName}" adında birden fazla tür var; türü soyuyla yazın.`,
        );
        continue;
      }
      const tank = resolveTank(row);
      const at = instant(row);
      if (!tank || !at) continue;
      const batch = { ...row, tankId: tank.id, occurredAt: at, id: newId(), speciesId: speciesIds[0]! };
      plan.batches.push(batch);
      const info: BatchInfo = { id: batch.id, lotCode: row.lotCode, farmEntryDate: at, initialAvgWeightG: row.avgWeightG, liveNow: new Map(), isNew: true };
      allBatches.push(info);
      batchByLot.set(key, info);
    }
    const batchById = new Map(allBatches.map((b) => [b.id, b]));

    // Every tank each batch has been in: stocked, moved, split or merged into (and, below, moved by this file).
    const movements = await client.batchMovement.findMany({
      where: { batchId: { in: batches.map((b) => b.id) } },
      select: { batchId: true, fromTankId: true, toTankId: true, fromBatchId: true, toBatchId: true },
    });
    const tanksOfBatch = new Map(allBatches.map((b) => [b.id, new Set(b.liveNow.keys())]));
    for (const m of movements) {
      for (const tankId of [m.fromTankId, m.toTankId]) if (tankId) tanksOfBatch.get(m.batchId)?.add(tankId);
      if (m.toBatchId && m.toTankId) tanksOfBatch.get(m.toBatchId)?.add(m.toTankId);
      if (m.fromBatchId && m.fromTankId) tanksOfBatch.get(m.fromBatchId)?.add(m.fromTankId);
    }
    for (const b of plan.batches) tanksOfBatch.get(b.id)!.add(b.tankId);

    // Live fish per batch and tank as the file moves them: what's there now, new stockings, transfers.
    const live = new Map<string, number>();
    const liveKey = (batchId: string, tankId: string) => `${batchId}|${tankId}`;
    const shift = (batchId: string, tankId: string, by: number) =>
      live.set(liveKey(batchId, tankId), (live.get(liveKey(batchId, tankId)) ?? 0) + by);
    for (const b of allBatches) for (const [tankId, count] of b.liveNow) shift(b.id, tankId, count);
    for (const b of plan.batches) shift(b.id, b.tankId, b.fishCount);

    const resolveBatch = (row: { sheet: string; row: number; lotCode?: string; tankCode: string }, tankId: string, at: Date) => {
      let batch: BatchInfo | undefined;
      if (row.lotCode) {
        batch = batchByLot.get(row.lotCode.toLocaleUpperCase("tr"));
        if (!batch) return fail(row, `"${row.lotCode}" kodlu parti bulunamadı.`);
        if (!tanksOfBatch.get(batch.id)?.has(tankId)) {
          return fail(row, `"${row.lotCode}" partisi "${row.tankCode}" tankında hiç bulunmamış.`);
        }
      } else {
        const here = allBatches.filter((b) => (live.get(liveKey(b.id, tankId)) ?? 0) > 0);
        if (here.length === 0) return fail(row, `"${row.tankCode}" tankında parti yok; "Parti kodu" sütununu doldurun.`);
        if (here.length > 1) return fail(row, `"${row.tankCode}" tankında birden fazla parti var; "Parti kodu" sütununu doldurun.`);
        batch = here[0]!;
      }
      if (localDay(at) < localDay(batch.farmEntryDate)) {
        return fail(row, `Tarih, ${batch.lotCode} partisinin stoklama tarihinden (${trDate(batch.farmEntryDate, timeZone)}) önce.`);
      }
      return batch;
    };
    const place = <R extends Extract<ImportRow, { date: SheetDate }>>(row: R) => {
      const tank = resolveTank(row);
      const at = instant(row);
      return tank && at ? { ...row, tankId: tank.id, occurredAt: at } : null;
    };

    // ---------- transfers: they decide which batch is in which tank for the rows after them ----------
    for (const row of of("transfer")) {
      const from = place(row);
      const to = resolveTank({ sheet: row.sheet, row: row.row, tankCode: row.toTankCode, farmCode: row.toFarmCode }, "hedef ");
      if (!from || !to) continue;
      if (to.id === from.tankId) {
        fail(row, "Kaynak ve hedef tank aynı.");
        continue;
      }
      const batch = resolveBatch(row, from.tankId, from.occurredAt);
      if (batch) plan.transfers.push({ ...from, batchId: batch.id, toTankId: to.id });
    }
    await this.dropExisting(client, plan, localDay, ["transfer"]);
    for (const t of plan.transfers) {
      shift(t.batchId, t.tankId, -t.fishCount);
      shift(t.batchId, t.toTankId, t.fishCount);
      tanksOfBatch.get(t.batchId)!.add(t.toTankId);
    }

    // ---------- records ----------
    for (const row of rows) {
      if (row.kind === "farm" || row.kind === "tank" || row.kind === "batch" || row.kind === "transfer") continue;
      const placed = place(row);
      if (!placed) continue;
      if (placed.kind === "water") {
        plan.water.push(placed);
        continue;
      }
      const batch = resolveBatch(placed, placed.tankId, placed.occurredAt);
      if (!batch) continue;
      if (placed.kind === "feeding") {
        const named = products.filter((p) => normalize(p.name) === normalize(placed.feedName));
        if (named.length !== 1) {
          fail(
            row,
            named.length === 0
              ? `"${placed.feedName}" adlı yem ürünü yok; önce Stoklar sayfasından ekleyin ya da adı uygulamadaki gibi yazın.`
              : `"${placed.feedName}" adında birden fazla yem ürünü var.`,
          );
          continue;
        }
        const farmId = allTanks.find((t) => t.id === placed.tankId)!.farmId;
        const warehouse = warehouses.find((w) => w.farmId === farmId) ?? warehouses[0];
        if (!warehouse) {
          fail(row, "Yemleme kaydı için önce Stoklar sayfasından bir depo ekleyin.");
          continue;
        }
        plan.feeding.push({ ...placed, batchId: batch.id, feedProductId: named[0]!.id, warehouseId: warehouse.id });
      } else if (placed.kind === "mortality") {
        plan.mortality.push({ ...placed, batchId: batch.id, avgWeightG: 0 });
      } else if (placed.kind === "weighing") {
        plan.weighing.push({ ...placed, batchId: batch.id });
      } else if (placed.kind === "harvest") {
        plan.harvest.push({ ...placed, batchId: batch.id, avgWeightG: placed.avgWeightG ?? 0, biomassKg: placed.biomassKg ?? 0 });
      } else {
        plan.treatment.push({ ...placed, batchId: batch.id });
      }
    }
    await this.dropExisting(client, plan, localDay, ["feeding", "mortality", "weighing", "water", "harvest", "treatment"]);

    // A death or harvest without a weight is at the batch's weight on its day: the last weighing
    // before it, imported or already in the app, else the stocking weight.
    const weighedBatches = [...new Set([...plan.mortality, ...plan.harvest].map((r) => r.batchId))];
    const existingWeighings = await client.weightSample.findMany({
      where: { batchId: { in: weighedBatches } },
      select: { batchId: true, occurredAt: true, avgWeightG: true },
    });
    const weighings = [
      ...existingWeighings.map((w) => ({ batchId: w.batchId, at: w.occurredAt, g: Number(w.avgWeightG) })),
      ...plan.weighing.map((w) => ({ batchId: w.batchId, at: w.occurredAt, g: w.avgWeightG })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const weightOn = (batchId: string, at: Date) =>
      weighings.filter((w) => w.batchId === batchId && w.at <= at).at(-1)?.g ?? batchById.get(batchId)!.initialAvgWeightG;
    for (const row of plan.mortality) row.avgWeightG = weightOn(row.batchId, row.occurredAt);
    for (const row of plan.harvest) {
      if (row.biomassKg > 0) row.avgWeightG = (row.biomassKg * 1000) / row.fishCount;
      else {
        row.avgWeightG ||= weightOn(row.batchId, row.occurredAt);
        row.biomassKg = (row.fishCount * row.avgWeightG) / 1000;
      }
    }

    // No tank may end below zero: what's left after all of history, the file's included.
    const firstOut = new Map<string, { sheet: string; row: number; tankCode: string }>();
    for (const r of [...plan.transfers, ...plan.mortality, ...plan.harvest]) {
      if (r.kind !== "transfer") shift(r.batchId, r.tankId, -r.fishCount);
      if (!firstOut.has(liveKey(r.batchId, r.tankId))) firstOut.set(liveKey(r.batchId, r.tankId), r);
    }
    for (const [key, count] of live) {
      const row = firstOut.get(key);
      if (count >= 0 || !row) continue;
      const lotCode = batchById.get(key.split("|")[0]!)!.lotCode;
      fail(
        row,
        `${lotCode} partisinin "${row.tankCode}" tankından çıkan balık (ölüm, hasat, transfer) tanktakinden ` +
          `${(-count).toLocaleString("tr")} fazla. Partiyi stoklama tarihindeki ilk adetle açtığınızdan emin olun.`,
      );
    }

    const perBatch = new Map<string, { deaths: number; harvested: number; weighings: number }>();
    const bump = (batchId: string, field: "deaths" | "harvested" | "weighings", by: number) => {
      const entry = perBatch.get(batchId) ?? { deaths: 0, harvested: 0, weighings: 0 };
      entry[field] += by;
      perBatch.set(batchId, entry);
    };
    for (const b of plan.batches) bump(b.id, "weighings", 0);
    for (const r of plan.mortality) bump(r.batchId, "deaths", r.fishCount);
    for (const r of plan.harvest) bump(r.batchId, "harvested", r.fishCount);
    for (const r of plan.weighing) bump(r.batchId, "weighings", 1);
    plan.effects = [...perBatch].map(([batchId, effect]) => {
      const batch = batchById.get(batchId)!;
      const liveNow = [...batch.liveNow.values()].reduce((a, b) => a + b, 0);
      const stocked = plan.batches.find((b) => b.id === batchId)?.fishCount ?? 0;
      return { lotCode: batch.lotCode, isNew: batch.isNew, ...effect, liveNow, liveAfter: liveNow + stocked - effect.deaths - effect.harvested };
    });
    plan.errors.sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : a.sheet.localeCompare(b.sheet, "tr")));
    return plan;
  }

  /**
   * Leaves out record rows the app already has, matched on tank, batch, day and value, as many
   * times as the app has them: importing the same file twice adds nothing, while two equal
   * feedings on one day in the file both count.
   */
  private async dropExisting(
    client: ReturnType<TenantPrismaService["forTenant"]>,
    plan: Plan,
    localDay: (at: Date) => string,
    kinds: RecordKind[],
  ) {
    const lists: Record<RecordKind, { tankId: string; occurredAt: Date }[]> = {
      feeding: plan.feeding,
      mortality: plan.mortality,
      weighing: plan.weighing,
      water: plan.water,
      harvest: plan.harvest,
      transfer: plan.transfers,
      treatment: plan.treatment,
    };
    const all = kinds.flatMap((k) => lists[k]);
    if (all.length === 0) return;
    const times = all.map((r) => r.occurredAt.getTime());
    const tankIds = [...new Set(all.map((r) => r.tankId))];
    const between = { gte: new Date(Math.min(...times) - 86_400_000), lte: new Date(Math.max(...times) + 86_400_000) };
    const window = { tankId: { in: tankIds }, occurredAt: between };
    const n = (v: unknown) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
    const day = (tankId: string, at: Date) => `${tankId}|${localDay(at)}`;
    const drop = <R>(rows: R[], existing: string[], key: (row: R) => string) => {
      const have = new Map<string, number>();
      for (const k of existing) have.set(k, (have.get(k) ?? 0) + 1);
      return rows.filter((row) => {
        const left = have.get(key(row)) ?? 0;
        if (left === 0) return true;
        have.set(key(row), left - 1);
        plan.skipped += 1;
        return false;
      });
    };

    if (kinds.includes("transfer")) {
      const moved = await client.batchMovement.findMany({
        where: { movementType: "TRANSFER", fromTankId: { in: tankIds }, occurredAt: between },
        select: { batchId: true, fromTankId: true, toTankId: true, fishCount: true, occurredAt: true },
      });
      const key = (batchId: string, from: string, to: string, count: number, at: Date) => `${day(from, at)}|${batchId}|${to}|${count}`;
      plan.transfers = drop(
        plan.transfers,
        moved.map((m) => key(m.batchId, m.fromTankId!, m.toTankId!, m.fishCount, m.occurredAt)),
        (r) => key(r.batchId, r.tankId, r.toTankId, r.fishCount, r.occurredAt),
      );
    }
    if (kinds.includes("feeding")) {
      const existing = await client.feedingEvent.findMany({
        where: window,
        select: { tankId: true, batchId: true, feedProductId: true, quantityKg: true, occurredAt: true },
      });
      const key = (r: { tankId: string; batchId: string; feedProductId: string; quantityKg: unknown; occurredAt: Date }) =>
        `${day(r.tankId, r.occurredAt)}|${r.batchId}|${r.feedProductId}|${n(r.quantityKg)}`;
      plan.feeding = drop(plan.feeding, existing.map(key), key);
    }
    if (kinds.includes("mortality")) {
      const existing = await client.mortalityEvent.findMany({ where: window, select: { tankId: true, batchId: true, fishCount: true, occurredAt: true } });
      const key = (r: { tankId: string; batchId: string; fishCount: number; occurredAt: Date }) => `${day(r.tankId, r.occurredAt)}|${r.batchId}|${r.fishCount}`;
      plan.mortality = drop(plan.mortality, existing.map(key), key);
    }
    if (kinds.includes("weighing")) {
      const existing = await client.weightSample.findMany({ where: window, select: { tankId: true, batchId: true, avgWeightG: true, occurredAt: true } });
      const key = (r: { tankId: string; batchId: string; avgWeightG: unknown; occurredAt: Date }) =>
        `${day(r.tankId, r.occurredAt)}|${r.batchId}|${n(r.avgWeightG)}`;
      plan.weighing = drop(plan.weighing, existing.map(key), key);
    }
    if (kinds.includes("water")) {
      const existing = await client.waterQualityReading.findMany({
        where: window,
        select: { tankId: true, occurredAt: true, temperatureC: true, dissolvedOxygenMgL: true, ph: true },
      });
      const key = (tankId: string, at: Date, m: { temperatureC?: unknown; dissolvedOxygenMgL?: unknown; ph?: unknown }) =>
        `${tankId}|${at.toISOString().slice(0, 16)}|${n(m.temperatureC)}|${n(m.dissolvedOxygenMgL)}|${n(m.ph)}`;
      plan.water = drop(
        plan.water,
        existing.map((r) => key(r.tankId, r.occurredAt, r)),
        (r) => key(r.tankId, r.occurredAt, r.metrics),
      );
    }
    if (kinds.includes("harvest")) {
      const existing = await client.harvestRecord.findMany({
        where: { type: "ACTUAL", deletedAt: null, tankId: { in: tankIds }, harvestedAt: between },
        select: { tankId: true, batchId: true, fishCount: true, harvestedAt: true },
      });
      const key = (tankId: string, batchId: string, count: number | null, at: Date) => `${day(tankId, at)}|${batchId}|${count}`;
      plan.harvest = drop(
        plan.harvest,
        existing.map((h) => key(h.tankId, h.batchId, h.fishCount, h.harvestedAt!)),
        (r) => key(r.tankId, r.batchId, r.fishCount, r.occurredAt),
      );
    }
    if (kinds.includes("treatment")) {
      const existing = await client.treatment.findMany({
        where: { deletedAt: null, tankId: { in: tankIds }, startedAt: between },
        select: { tankId: true, batchId: true, productName: true, startedAt: true },
      });
      const key = (tankId: string, batchId: string, product: string, at: Date) => `${day(tankId, at)}|${batchId}|${normalize(product)}`;
      plan.treatment = drop(
        plan.treatment,
        existing.map((t) => key(t.tankId, t.batchId, t.productName, t.startedAt)),
        (r) => key(r.tankId, r.batchId, r.productName, r.occurredAt),
      );
    }
  }
}

function summarize(fileName: string, plan: Plan): ImportPreview {
  return {
    fileName,
    counts: {
      farm: plan.farms.length,
      tank: plan.tanks.length,
      batch: plan.batches.length,
      feeding: plan.feeding.length,
      mortality: plan.mortality.length,
      weighing: plan.weighing.length,
      water: plan.water.length,
      harvest: plan.harvest.length,
      transfer: plan.transfers.length,
      treatment: plan.treatment.length,
    },
    skipped: plan.skipped,
    errorCount: plan.errors.length,
    errors: plan.errors.slice(0, ERRORS_SHOWN),
    ignoredSheets: plan.ignoredSheets,
    batches: plan.effects,
  };
}

/** 12:00 UTC: the same calendar day everywhere from UTC−11 to UTC+11. */
function noonUtc(date: SheetDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}

/** The moment a sheet date stands for: a day without a time at noonUtc, a time of day in the farm's zone. */
export function toInstant(date: SheetDate, timeZone: string): Date {
  if (date.hour === undefined) return noonUtc(date);
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute ?? 0);
  return new Date(asUtc - zoneOffsetMs(new Date(asUtc), timeZone));
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!) - at.getTime();
}

function trDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("tr", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(at);
}
