import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import type { TenantContext } from "../../common/types/request-context";
import { AuditService } from "../audit/audit.service";
import { FeedInventoryProjectionService } from "../feed-inventory/feed-inventory-projection.service";
import { BatchProjectionService } from "../fish-batches/batch-projection.service";
import {
  normalize,
  readImportWorkbook,
  type FeedingRow,
  type ImportKind,
  type ImportRow,
  type MortalityRow,
  type RowError,
  type SheetDate,
  type WaterRow,
  type WeighingRow,
} from "./import-sheets";

/** What a file may hold: enough for years of a large farm's records, bounded for one request. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 50_000;
const ERRORS_SHOWN = 200;

export interface UploadedSheetFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface ImportPreview {
  fileName: string;
  /** Rows that would be written, per kind. */
  counts: Record<ImportKind, number>;
  /** Rows already in the app (an earlier import of the same file, say), left out. */
  skipped: number;
  errorCount: number;
  errors: RowError[];
  ignoredSheets: string[];
  /** What the import does to each batch's live count, so a wrong file shows before it's written. */
  batches: { lotCode: string; deaths: number; weighings: number; liveNow: number; liveAfter: number }[];
}

type Resolved<R extends ImportRow> = R & { tankId: string; occurredAt: Date };
type ResolvedBatchRow<R extends ImportRow> = Resolved<R> & { batchId: string };
interface Plan {
  feeding: (ResolvedBatchRow<FeedingRow> & { feedProductId: string; warehouseId: string })[];
  mortality: (ResolvedBatchRow<MortalityRow> & { avgWeightG: number })[];
  weighing: ResolvedBatchRow<WeighingRow>[];
  water: Resolved<WaterRow>[];
  skipped: number;
  errors: RowError[];
  ignoredSheets: string[];
  batches: ImportPreview["batches"];
}

/**
 * Brings a farm's history in from Excel: feeding, mortality, weighings and water quality, written
 * as if they had been recorded in the app on their dates, so a new customer's dashboards,
 * forecasts and reports work from day one. A file is checked whole first; it is written only if
 * every row is understood, and then in one transaction, tagged with its DataImport so it can be
 * undone as a whole.
 *
 * Unlike recording a day in the app, an import raises no alerts or e-mails (it is history), and
 * its feeding leaves today's feed stock alone: each feed comes in on an import lot as an opening
 * adjustment and goes out as the consumption recorded, netting to zero.
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
    const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      throw new BadRequestException("Dosyada yazılacak yeni kayıt yok.");
    }

    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const companyId = tenant.companyId;
    const counts = { ...summary.counts, skipped: summary.skipped };
    const { importId, lotIds } = await client.$transaction(
      async (tx) => {
        const created = await tx.dataImport.create({
          data: { companyId, userId, fileName, counts },
        });
        const tag = { importId: created.id };

        // Feeding: per warehouse and feed, an import lot that receives what the history consumed.
        const lots = new Map<string, typeof plan.feeding>();
        for (const row of plan.feeding) {
          const key = `${row.warehouseId}|${row.feedProductId}`;
          lots.set(key, [...(lots.get(key) ?? []), row]);
        }
        const lotIds: string[] = [];
        for (const rows of lots.values()) {
          const { warehouseId, feedProductId } = rows[0]!;
          const lot = await tx.feedInventoryBatch.create({
            data: { companyId, warehouseId, feedProductId, supplierLotCode: "Excel içe aktarımı", createdById: userId, ...tag },
          });
          lotIds.push(lot.id);
          const earliest = new Date(Math.min(...rows.map((r) => r.occurredAt.getTime())));
          const totalKg = rows.reduce((sum, r) => sum + r.quantityKg, 0);
          const reference = { referenceType: "DataImport", referenceId: created.id };
          await tx.feedInventoryTransaction.create({
            data: {
              companyId,
              warehouseId,
              feedInventoryBatchId: lot.id,
              type: "ADJUSTMENT",
              quantityKg: totalKg,
              occurredAt: earliest,
              createdById: userId,
              notes: "Excel içe aktarımı: geçmiş yemlemelerin açılış stoku",
              ...reference,
              ...tag,
            },
          });
          const consumptions = rows.map((row) => ({
            id: randomUUID(),
            companyId,
            warehouseId,
            feedInventoryBatchId: lot.id,
            type: "FEED_CONSUMPTION" as const,
            quantityKg: row.quantityKg,
            occurredAt: row.occurredAt,
            createdById: userId,
            ...reference,
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
              createdById: userId,
              notes: row.notes,
              inventoryTransactionId: consumptions[i]!.id,
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
            createdById: userId,
            notes: row.notes,
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
            createdById: userId,
            notes: row.notes,
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
            createdById: userId,
            notes: row.notes,
            ...tag,
          })),
        });
        return { importId: created.id, lotIds };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    await this.recompute(tenant.companyId, lotIds, [
      ...plan.feeding.map((r) => r.batchId),
      ...plan.mortality.map((r) => r.batchId),
      ...plan.weighing.map((r) => r.batchId),
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

  /** Removes everything one import wrote and puts the batches back as they were without it. */
  async undo(tenant: TenantContext, userId: string, importId: string) {
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const found = await client.dataImport.findFirst({ where: { id: importId } });
    if (!found) throw new NotFoundException("İçe aktarım bulunamadı.");
    if (found.undoneAt) throw new ConflictException("Bu içe aktarım zaten geri alınmış.");

    const tag = { importId };
    const [lots, ...touched] = await Promise.all([
      client.feedInventoryBatch.findMany({ where: tag, select: { id: true } }),
      client.feedingEvent.findMany({ where: tag, select: { batchId: true }, distinct: ["batchId"] }),
      client.mortalityEvent.findMany({ where: tag, select: { batchId: true }, distinct: ["batchId"] }),
      client.weightSample.findMany({ where: tag, select: { batchId: true }, distinct: ["batchId"] }),
    ]);
    const lotIds = lots.map((l) => l.id);
    try {
      await client.$transaction(async (tx) => {
        await tx.feedingEvent.deleteMany({ where: tag });
        await tx.feedInventoryTransaction.deleteMany({ where: tag });
        await tx.feedInventoryBalance.deleteMany({ where: { feedInventoryBatchId: { in: lotIds } } });
        await tx.feedInventoryBatch.deleteMany({ where: tag });
        await tx.mortalityEvent.deleteMany({ where: tag });
        await tx.weightSample.deleteMany({ where: tag });
        await tx.waterQualityReading.deleteMany({ where: tag });
        await tx.dataImport.updateMany({ where: { id: importId }, data: { undoneAt: new Date() } });
      });
    } catch {
      // The only way in is a feed movement recorded later against an import lot.
      throw new ConflictException(
        "Bu içe aktarımın yem stoğunda sonradan işlem yapılmış; geri alınamıyor. Destek ekibiyle iletişime geçin.",
      );
    }
    await this.recompute(tenant.companyId, [], touched.flat().map((t) => t.batchId));
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

  /** Matches every row to its tank, batch and feed, checks it against the app, and drops what's already there. */
  private async plan(tenant: TenantContext, rows: ImportRow[], readErrors: RowError[], ignoredSheets: string[]): Promise<Plan> {
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const plan: Plan = { feeding: [], mortality: [], weighing: [], water: [], skipped: 0, errors: [...readErrors], ignoredSheets, batches: [] };
    if (rows.length === 0) return plan;

    const [membership, tanks, batches, products, warehouses] = await Promise.all([
      client.companyMembership.findFirst({
        where: { id: tenant.membershipId },
        select: { company: { select: { timezone: true } } },
      }),
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
      client.feedProduct.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      client.warehouse.findMany({ where: { deletedAt: null }, select: { id: true, farmId: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const timeZone = membership?.company.timezone ?? "Europe/Istanbul";
    const localDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
    const now = Date.now();

    const tanksByCode = groupBy(tanks, (t) => normalize(t.code));
    const batchByLot = new Map(batches.map((b) => [b.lotCode.toLocaleUpperCase("tr"), b]));
    const productsByName = groupBy(products, (p) => normalize(p.name));
    // Every tank each batch has been in: stocked, moved, split or merged into.
    const movements = await client.batchMovement.findMany({
      where: { batchId: { in: batches.map((b) => b.id) } },
      select: { batchId: true, fromTankId: true, toTankId: true, fromBatchId: true, toBatchId: true },
    });
    const tanksOfBatch = new Map(batches.map((b) => [b.id, new Set(b.tankStates.map((s) => s.tankId))]));
    for (const m of movements) {
      for (const tankId of [m.fromTankId, m.toTankId]) if (tankId) tanksOfBatch.get(m.batchId)?.add(tankId);
      if (m.toBatchId && m.toTankId) tanksOfBatch.get(m.toBatchId)?.add(m.toTankId);
      if (m.fromBatchId && m.fromTankId) tanksOfBatch.get(m.fromBatchId)?.add(m.fromTankId);
    }

    const fail = (row: ImportRow, message: string) => {
      plan.errors.push({ sheet: row.sheet, row: row.row, message });
      return null;
    };
    const resolveTank = (row: ImportRow) => {
      const candidates = tanksByCode.get(normalize(row.tankCode)) ?? [];
      const inFarm = row.farmCode
        ? candidates.filter((t) => normalize(t.farmSection.farm.code) === normalize(row.farmCode!))
        : candidates;
      if (candidates.length === 0) return fail(row, `"${row.tankCode}" kodlu tank bulunamadı.`);
      if (inFarm.length === 0) return fail(row, `"${row.farmCode}" çiftliğinde "${row.tankCode}" kodlu tank yok.`);
      if (inFarm.length > 1) {
        return fail(row, `"${row.tankCode}" kodlu tank birden fazla çiftlikte var; "Çiftlik kodu" sütununu doldurun.`);
      }
      const tank = inFarm[0]!;
      if (tenant.farmScopeIds.length > 0 && !tenant.farmScopeIds.includes(tank.farmSection.farmId)) {
        return fail(row, `"${row.tankCode}" tankına erişiminiz yok.`);
      }
      return tank;
    };
    const instant = (row: ImportRow) => {
      const at = toInstant(row.date, timeZone);
      if (at.getTime() > now + 60 * 60 * 1000) return fail(row, "Tarih ileride; yalnızca geçmiş kayıtlar içe aktarılabilir.");
      return at;
    };
    const resolveBatch = (row: FeedingRow | MortalityRow | WeighingRow, tankId: string, at: Date) => {
      let batch: (typeof batches)[number] | undefined;
      if (row.lotCode) {
        batch = batchByLot.get(row.lotCode.toLocaleUpperCase("tr"));
        if (!batch) return fail(row, `"${row.lotCode}" kodlu parti bulunamadı.`);
        if (!tanksOfBatch.get(batch.id)?.has(tankId)) {
          return fail(row, `"${row.lotCode}" partisi "${row.tankCode}" tankında hiç bulunmamış.`);
        }
      } else {
        const here = batches.filter((b) => b.tankStates.some((s) => s.tankId === tankId && s.estimatedCount > 0));
        if (here.length === 0) return fail(row, `"${row.tankCode}" tankında şu an parti yok; "Parti kodu" sütununu doldurun.`);
        if (here.length > 1) return fail(row, `"${row.tankCode}" tankında birden fazla parti var; "Parti kodu" sütununu doldurun.`);
        batch = here[0]!;
      }
      if (localDay(at) < localDay(batch.farmEntryDate)) {
        return fail(row, `Tarih, ${batch.lotCode} partisinin stoklama tarihinden (${trDate(batch.farmEntryDate, timeZone)}) önce.`);
      }
      return batch;
    };

    for (const row of rows) {
      const tank = resolveTank(row);
      const at = instant(row);
      if (!tank || !at) continue;
      const placed = { ...row, tankId: tank.id, occurredAt: at };
      if (row.kind === "water") {
        plan.water.push(placed as Resolved<WaterRow>);
        continue;
      }
      const batch = resolveBatch(row, tank.id, at);
      if (!batch) continue;
      if (row.kind === "feeding") {
        const named = productsByName.get(normalize(row.feedName)) ?? [];
        if (named.length !== 1) {
          fail(
            row,
            named.length === 0
              ? `"${row.feedName}" adlı yem ürünü yok; önce Stoklar sayfasından ekleyin ya da adı uygulamadaki gibi yazın.`
              : `"${row.feedName}" adında birden fazla yem ürünü var.`,
          );
          continue;
        }
        const warehouse = warehouses.find((w) => w.farmId === tank.farmSection.farmId) ?? warehouses[0];
        if (!warehouse) {
          fail(row, "Yemleme kaydı için önce Stoklar sayfasından bir depo ekleyin.");
          continue;
        }
        plan.feeding.push({ ...(placed as Resolved<FeedingRow>), batchId: batch.id, feedProductId: named[0]!.id, warehouseId: warehouse.id });
      } else if (row.kind === "mortality") {
        plan.mortality.push({ ...(placed as Resolved<MortalityRow>), batchId: batch.id, avgWeightG: 0 });
      } else {
        plan.weighing.push({ ...(placed as Resolved<WeighingRow>), batchId: batch.id });
      }
    }

    await this.dropExisting(client, plan, localDay);

    // Each death is recorded at the batch's weight on its day: the last weighing before it,
    // imported or already in the app, else the stocking weight.
    const batchById = new Map(batches.map((b) => [b.id, b]));
    const deathBatches = [...new Set(plan.mortality.map((r) => r.batchId))];
    const existingWeighings = await client.weightSample.findMany({
      where: { batchId: { in: deathBatches } },
      select: { batchId: true, occurredAt: true, avgWeightG: true },
    });
    const weighings = [
      ...existingWeighings.map((w) => ({ batchId: w.batchId, at: w.occurredAt, g: Number(w.avgWeightG) })),
      ...plan.weighing.map((w) => ({ batchId: w.batchId, at: w.occurredAt, g: w.avgWeightG })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const row of plan.mortality) {
      const before = weighings.filter((w) => w.batchId === row.batchId && w.at <= row.occurredAt).at(-1);
      row.avgWeightG = before?.g ?? Number(batchById.get(row.batchId)!.initialAvgWeightG);
    }

    // Deaths can't take a tank below zero: the live count is what's left after all of history.
    const deaths = new Map<string, { sum: number; first: MortalityRow }>();
    for (const row of plan.mortality) {
      const key = `${row.batchId}|${row.tankId}`;
      const entry = deaths.get(key) ?? { sum: 0, first: row };
      entry.sum += row.fishCount;
      deaths.set(key, entry);
    }
    for (const [key, { sum, first }] of deaths) {
      const [batchId, tankId] = key.split("|") as [string, string];
      const live = batchById.get(batchId)!.tankStates.find((s) => s.tankId === tankId)?.estimatedCount ?? 0;
      if (sum > live) {
        fail(
          first,
          `${batchById.get(batchId)!.lotCode} partisinin "${first.tankCode}" tankı için içe aktarılan ölümler (${sum.toLocaleString("tr")}) ` +
            `tanktaki canlı balıktan (${live.toLocaleString("tr")}) fazla. Partiyi stoklama tarihindeki ilk adetle açtığınızdan emin olun.`,
        );
      }
    }

    const perBatch = new Map<string, { deaths: number; weighings: number }>();
    const bump = (batchId: string, field: "deaths" | "weighings", by: number) => {
      const entry = perBatch.get(batchId) ?? { deaths: 0, weighings: 0 };
      entry[field] += by;
      perBatch.set(batchId, entry);
    };
    for (const row of plan.mortality) bump(row.batchId, "deaths", row.fishCount);
    for (const row of plan.weighing) bump(row.batchId, "weighings", 1);
    plan.batches = [...perBatch].map(([batchId, effect]) => {
      const batch = batchById.get(batchId)!;
      const liveNow = batch.tankStates.reduce((sum, s) => sum + s.estimatedCount, 0);
      return { lotCode: batch.lotCode, ...effect, liveNow, liveAfter: liveNow - effect.deaths };
    });
    plan.errors.sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : a.sheet.localeCompare(b.sheet, "tr")));
    return plan;
  }

  /**
   * Leaves out rows the app already has, matched on tank, batch, day and value, as many times as
   * the app has them: importing the same file twice adds nothing, while two equal feedings on one
   * day in the file both count.
   */
  private async dropExisting(
    client: ReturnType<TenantPrismaService["forTenant"]>,
    plan: Plan,
    localDay: (at: Date) => string,
  ) {
    const all = [...plan.feeding, ...plan.mortality, ...plan.weighing, ...plan.water];
    if (all.length === 0) return;
    const times = all.map((r) => r.occurredAt.getTime());
    const window = {
      tankId: { in: [...new Set(all.map((r) => r.tankId))] },
      occurredAt: { gte: new Date(Math.min(...times) - 86_400_000), lte: new Date(Math.max(...times) + 86_400_000) },
    };
    const [feedings, deaths, samples, readings] = await Promise.all([
      client.feedingEvent.findMany({ where: window, select: { tankId: true, batchId: true, feedProductId: true, quantityKg: true, occurredAt: true } }),
      client.mortalityEvent.findMany({ where: window, select: { tankId: true, batchId: true, fishCount: true, occurredAt: true } }),
      client.weightSample.findMany({ where: window, select: { tankId: true, batchId: true, avgWeightG: true, occurredAt: true } }),
      client.waterQualityReading.findMany({
        where: window,
        select: { tankId: true, occurredAt: true, temperatureC: true, dissolvedOxygenMgL: true, ph: true },
      }),
    ]);
    const n = (v: unknown) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
    const day = (r: { tankId: string; occurredAt: Date }) => `${r.tankId}|${localDay(r.occurredAt)}`;
    const waterKey = (tankId: string, at: Date, m: { temperatureC?: unknown; dissolvedOxygenMgL?: unknown; ph?: unknown }) =>
      `${tankId}|${at.toISOString().slice(0, 16)}|${n(m.temperatureC)}|${n(m.dissolvedOxygenMgL)}|${n(m.ph)}`;
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
    const feedingKey = (r: { batchId: string; feedProductId: string; quantityKg: unknown; tankId: string; occurredAt: Date }) =>
      `${day(r)}|${r.batchId}|${r.feedProductId}|${n(r.quantityKg)}`;
    const deathKey = (r: { batchId: string; fishCount: number; tankId: string; occurredAt: Date }) =>
      `${day(r)}|${r.batchId}|${r.fishCount}`;
    const sampleKey = (r: { batchId: string; avgWeightG: unknown; tankId: string; occurredAt: Date }) =>
      `${day(r)}|${r.batchId}|${n(r.avgWeightG)}`;
    plan.feeding = drop(plan.feeding, feedings.map(feedingKey), feedingKey);
    plan.mortality = drop(plan.mortality, deaths.map(deathKey), deathKey);
    plan.weighing = drop(plan.weighing, samples.map(sampleKey), sampleKey);
    plan.water = drop(
      plan.water,
      readings.map((r) => waterKey(r.tankId, r.occurredAt, r)),
      (r) => waterKey(r.tankId, r.occurredAt, r.metrics),
    );
  }
}

function summarize(fileName: string, plan: Plan): ImportPreview {
  return {
    fileName,
    counts: { feeding: plan.feeding.length, mortality: plan.mortality.length, weighing: plan.weighing.length, water: plan.water.length },
    skipped: plan.skipped,
    errorCount: plan.errors.length,
    errors: plan.errors.slice(0, ERRORS_SHOWN),
    ignoredSheets: plan.ignoredSheets,
    batches: plan.batches,
  };
}

/**
 * The moment a sheet date stands for. A day without a time is recorded at 12:00 UTC, which is the
 * same calendar day everywhere from UTC−11 to UTC+11; a time of day is the farm's local time.
 */
export function toInstant(date: SheetDate, timeZone: string): Date {
  if (date.hour === undefined) return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
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

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
