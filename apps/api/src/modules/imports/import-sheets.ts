import type { MortalityReason, TankType, TreatmentType } from "@prisma/client";

/**
 * Turns the sheets of an uploaded workbook into typed rows, one kind per sheet: the farm's structure
 * (farms, tanks, batches) and its history (feeding, mortality, weighings, water quality, harvests,
 * transfers, treatments). Pure: it knows nothing of what the company already has (ImportsService
 * resolves that); it only reads cells. Built for the files farms actually keep, so it is forgiving
 * about how things are written — sheet and column names in any case and with or without Turkish
 * letters, dates as Excel dates or "15.03.2026", numbers as "1.250,5" — and strict about what they
 * mean: a row it can't read is reported with its sheet and row number, never guessed at.
 */

export type ImportKind =
  | "farm"
  | "tank"
  | "batch"
  | "feeding"
  | "mortality"
  | "weighing"
  | "water"
  | "harvest"
  | "transfer"
  | "treatment";

/** A calendar day, with a time of day where the sheet gives one (water readings). */
export interface SheetDate {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}

interface Located {
  sheet: string;
  /** The row number as Excel shows it. */
  row: number;
}

export interface FarmRow extends Located {
  kind: "farm";
  farmCode: string;
  farmName: string;
}

export interface TankRow extends Located {
  kind: "tank";
  farmCode: string;
  sectionName?: string;
  tankCode: string;
  tankType: TankType;
  volumeM3?: number;
  maxBiomassKg?: number;
}

/** A record that happened in a tank on a day. */
interface Placed extends Located {
  date: SheetDate;
  farmCode?: string;
  tankCode: string;
  notes?: string;
}

export interface BatchRow extends Placed {
  kind: "batch";
  lotCode: string;
  speciesName: string;
  fishCount: number;
  avgWeightG: number;
  targetFcr?: number;
  supplier?: string;
}

export interface FeedingRow extends Placed {
  kind: "feeding";
  lotCode?: string;
  feedName: string;
  quantityKg: number;
  unitPriceTry?: number;
}

export interface MortalityRow extends Placed {
  kind: "mortality";
  lotCode?: string;
  fishCount: number;
  reason: MortalityReason;
}

export interface WeighingRow extends Placed {
  kind: "weighing";
  lotCode?: string;
  sampleSize: number;
  avgWeightG: number;
}

export const WATER_METRICS = [
  "temperatureC",
  "dissolvedOxygenMgL",
  "ph",
  "ammoniaMgL",
  "nitriteMgL",
  "nitrateMgL",
  "salinityPpt",
] as const;
export type WaterMetric = (typeof WATER_METRICS)[number];

export interface WaterRow extends Placed {
  kind: "water";
  metrics: Partial<Record<WaterMetric, number>>;
}

export interface HarvestRow extends Placed {
  kind: "harvest";
  lotCode?: string;
  fishCount: number;
  biomassKg?: number;
  avgWeightG?: number;
  /** The tank was emptied (a full harvest), not partly fished. */
  full: boolean;
  unitPriceTry?: number;
  customer?: string;
}

/** Placed in the source tank; the destination is toTankCode. */
export interface TransferRow extends Placed {
  kind: "transfer";
  lotCode?: string;
  toFarmCode?: string;
  toTankCode: string;
  fishCount: number;
}

export interface TreatmentRow extends Placed {
  kind: "treatment";
  lotCode?: string;
  treatmentType: TreatmentType;
  productName: string;
  dosage?: string;
  withdrawalDays?: number;
  endDate?: SheetDate;
}

export type ImportRow =
  | FarmRow
  | TankRow
  | BatchRow
  | FeedingRow
  | MortalityRow
  | WeighingRow
  | WaterRow
  | HarvestRow
  | TransferRow
  | TreatmentRow;

export interface RowError extends Located {
  message: string;
}

export interface ReadResult {
  rows: ImportRow[];
  errors: RowError[];
  /** Sheets that matched no kind; reported, not read. */
  ignoredSheets: string[];
}

/** Lowercase ASCII letters and digits only: "Miktar (kg)" and "MİKTAR KG" both become "miktarkg". */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    // NFKD also turns "m³" into "m3"; the ₺ sign has no letters and drops out.
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/** The template's own instruction and reference tabs: skipped without mention. */
const HELPER_SHEETS = ["nasildoldurulur", "kodlariniz", "aciklama", "aciklamalar"];

const SHEET_NAMES: Record<ImportKind, string[]> = {
  farm: ["ciftlikler", "ciftlik"],
  tank: ["tanklar", "tank", "kafesler", "havuzlar", "birimler"],
  batch: ["partiler", "parti", "stoklama", "stoklamalar"],
  feeding: ["yemleme", "yem", "yemlemeler"],
  mortality: ["olum", "olumler", "mortalite"],
  weighing: ["tartim", "tartimlar", "agirlik", "ornekleme"],
  water: ["sukalitesi", "su", "suolcumleri", "suolcumu"],
  harvest: ["hasat", "hasatlar"],
  transfer: ["transfer", "transferler", "aktarma", "tasima"],
  treatment: ["tedavi", "tedaviler", "ilac", "asilama", "asi"],
};

type Field =
  | "date"
  | "time"
  | "endDate"
  | "farmCode"
  | "farmName"
  | "sectionName"
  | "tankCode"
  | "tankType"
  | "volumeM3"
  | "maxBiomassKg"
  | "toFarmCode"
  | "toTankCode"
  | "lotCode"
  | "speciesName"
  | "targetFcr"
  | "supplier"
  | "notes"
  | "feedName"
  | "quantityKg"
  | "unitPriceTry"
  | "fishCount"
  | "reason"
  | "sampleSize"
  | "avgWeightG"
  | "biomassKg"
  | "full"
  | "customer"
  | "treatmentType"
  | "productName"
  | "dosage"
  | "withdrawalDays"
  | WaterMetric;

/**
 * Column names each field answers to, normalized; the template's own header comes first. A name
 * may serve two fields that never share a sheet ("Tür" is a tank's type, a batch's species).
 */
const COLUMNS: Record<Field, string[]> = {
  date: ["tarih", "stoklamatarihi", "giristarihi", "baslangictarihi", "baslangic"],
  time: ["saat"],
  endDate: ["bitistarihi", "bitis"],
  farmCode: ["ciftlikkodu", "ciftlik", "kaynakciftlikkodu", "kaynakciftlik"],
  farmName: ["ciftlikadi", "ad", "adi"],
  sectionName: ["bolum", "bolumadi"],
  tankCode: ["tankkodu", "tank", "kafeskodu", "kafes", "havuzkodu", "havuz", "kaynaktankkodu", "kaynaktank", "nereden"],
  tankType: ["tur", "tip", "tanktipi", "tanktur"],
  volumeM3: ["hacimm3", "hacim"],
  maxBiomassKg: ["maksbiyokutlekg", "maksimumbiyokutlekg", "maksbiyokutle", "kapasitekg", "kapasite"],
  toFarmCode: ["hedefciftlikkodu", "hedefciftlik"],
  toTankCode: ["hedeftankkodu", "hedeftank", "nereye"],
  lotCode: ["partikodu", "parti", "lotkodu", "lot"],
  speciesName: ["tur", "balikturu", "cins"],
  targetFcr: ["hedeffcr"],
  supplier: ["tedarikci", "kuluckahane"],
  notes: ["not", "notlar", "aciklama"],
  feedName: ["yem", "yemadi", "yemurunu", "urun"],
  quantityKg: ["miktarkg", "miktar", "yemkg", "kg"],
  unitPriceTry: ["birimfiyatkg", "birimfiyattlkg", "birimfiyat", "fiyatkg", "fiyattlkg", "fiyat", "satisfiyatikg", "satisfiyatitlkg", "satisfiyati"],
  fishCount: ["adet", "ilkadet", "stoklananadet", "oluadedi", "olumadedi", "olusayisi", "balikadedi"],
  reason: ["sebep", "neden", "olumsebebi"],
  sampleSize: ["ornekadedi", "ornek", "tartilanbalik", "tartilanadet"],
  avgWeightG: ["ortalamaagirlikg", "ortalamaagirlik", "ilkortalamaagirlikg", "ilkortalamaagirlik", "ortagirlikg", "agirlikg", "gram"],
  biomassKg: ["toplamagirlikkg", "toplamagirlik", "biyokutlekg", "biyokutle", "kg"],
  full: ["tamhasat", "tam"],
  customer: ["musteri", "alici"],
  treatmentType: ["tur", "tip", "tedavituru"],
  productName: ["urun", "urunadi", "ilac", "ilacadi", "asi"],
  dosage: ["doz", "dozaj"],
  withdrawalDays: ["arinmasuresigun", "arinmasuresi", "arinma", "beklemesuresi"],
  temperatureC: ["sicaklikc", "sicaklik", "susicakligi"],
  dissolvedOxygenMgL: ["cozunmusoksijenmgl", "cozunmusoksijen", "oksijenmgl", "oksijen"],
  ph: ["ph"],
  ammoniaMgL: ["amonyakmgl", "amonyak"],
  nitriteMgL: ["nitritmgl", "nitrit"],
  nitrateMgL: ["nitratmgl", "nitrat"],
  salinityPpt: ["tuzlulukppt", "tuzluluk"],
};

const PLACED: Field[] = ["date", "farmCode", "tankCode", "notes"];
const FIELDS: Record<ImportKind, { fields: Field[]; required: Field[] }> = {
  farm: { fields: ["farmCode", "farmName"], required: ["farmCode", "farmName"] },
  tank: { fields: ["farmCode", "sectionName", "tankCode", "tankType", "volumeM3", "maxBiomassKg"], required: ["farmCode", "tankCode"] },
  batch: {
    fields: [...PLACED, "lotCode", "speciesName", "fishCount", "avgWeightG", "targetFcr", "supplier"],
    required: ["date", "tankCode", "lotCode", "speciesName", "fishCount", "avgWeightG"],
  },
  feeding: { fields: [...PLACED, "lotCode", "feedName", "quantityKg", "unitPriceTry"], required: ["date", "tankCode", "feedName", "quantityKg"] },
  mortality: { fields: [...PLACED, "lotCode", "fishCount", "reason"], required: ["date", "tankCode", "fishCount"] },
  weighing: { fields: [...PLACED, "lotCode", "sampleSize", "avgWeightG"], required: ["date", "tankCode", "sampleSize", "avgWeightG"] },
  water: { fields: [...PLACED, "time", ...WATER_METRICS], required: ["date", "tankCode"] },
  harvest: {
    fields: [...PLACED, "lotCode", "fishCount", "biomassKg", "avgWeightG", "full", "unitPriceTry", "customer"],
    required: ["date", "tankCode", "fishCount"],
  },
  transfer: { fields: [...PLACED, "lotCode", "toFarmCode", "toTankCode", "fishCount"], required: ["date", "tankCode", "toTankCode", "fishCount"] },
  treatment: {
    fields: [...PLACED, "lotCode", "treatmentType", "productName", "dosage", "withdrawalDays", "endDate"],
    required: ["date", "tankCode", "productName"],
  },
};

const FIELD_LABEL: Record<Field, string> = {
  date: "Tarih",
  time: "Saat",
  endDate: "Bitiş tarihi",
  farmCode: "Çiftlik kodu",
  farmName: "Çiftlik adı",
  sectionName: "Bölüm",
  tankCode: "Tank kodu",
  tankType: "Tür",
  volumeM3: "Hacim (m³)",
  maxBiomassKg: "Maks. biyokütle (kg)",
  toFarmCode: "Hedef çiftlik kodu",
  toTankCode: "Hedef tank kodu",
  lotCode: "Parti kodu",
  speciesName: "Tür",
  targetFcr: "Hedef FCR",
  supplier: "Tedarikçi",
  notes: "Not",
  feedName: "Yem",
  quantityKg: "Miktar (kg)",
  unitPriceTry: "Birim fiyat (₺/kg)",
  fishCount: "Adet",
  reason: "Sebep",
  sampleSize: "Örnek adedi",
  avgWeightG: "Ortalama ağırlık (g)",
  biomassKg: "Toplam ağırlık (kg)",
  full: "Tam hasat",
  customer: "Müşteri",
  treatmentType: "Tür",
  productName: "Ürün",
  dosage: "Doz",
  withdrawalDays: "Arınma süresi (gün)",
  temperatureC: "Sıcaklık (°C)",
  dissolvedOxygenMgL: "Çözünmüş oksijen (mg/L)",
  ph: "pH",
  ammoniaMgL: "Amonyak (mg/L)",
  nitriteMgL: "Nitrit (mg/L)",
  nitrateMgL: "Nitrat (mg/L)",
  salinityPpt: "Tuzluluk (ppt)",
};

/** Plausible ranges, so a value in the wrong column ("120" as °C) is caught rather than stored. */
const WATER_RANGE: Record<WaterMetric, [number, number]> = {
  temperatureC: [-2, 40],
  dissolvedOxygenMgL: [0, 30],
  ph: [0, 14],
  ammoniaMgL: [0, 100],
  nitriteMgL: [0, 100],
  nitrateMgL: [0, 1000],
  salinityPpt: [0, 60],
};

const REASONS: Record<string, MortalityReason> = {
  bilinmiyor: "UNKNOWN",
  hastalik: "DISEASE",
  oksijen: "OXYGEN",
  oksijenyetersizligi: "OXYGEN",
  sicaklik: "TEMPERATURE",
  transferstresi: "TRANSFER_STRESS",
  transfer: "TRANSFER_STRESS",
  fizikselhasar: "PHYSICAL_DAMAGE",
  yaralanma: "PHYSICAL_DAMAGE",
  yirtici: "PREDATOR",
  yemleiliskili: "FEED_RELATED",
  yem: "FEED_RELATED",
  diger: "OTHER",
};
const REASON_HINT = "Bilinmiyor, Hastalık, Oksijen yetersizliği, Sıcaklık, Transfer stresi, Fiziksel hasar, Yırtıcı, Yemle ilişkili, Diğer";

const TANK_TYPES: Record<string, TankType> = {
  tank: "TANK",
  beton: "TANK",
  havuz: "POND",
  gol: "POND",
  kafes: "CAGE",
  agkafes: "CAGE",
  kanal: "RACEWAY",
  raceway: "RACEWAY",
  akintihavuzu: "RACEWAY",
};
const TREATMENT_TYPES: Record<string, TreatmentType> = { ilac: "MEDICATION", ilactedavisi: "MEDICATION", asi: "VACCINATION", asilama: "VACCINATION" };
const YES = ["evet", "e", "x", "var", "tam", "1", "true"];
const NO = ["hayir", "h", "yok", "kismi", "0", "false"];

export function readImportWorkbook(sheets: { sheet: string; data: unknown[][] }[]): ReadResult {
  const result: ReadResult = { rows: [], errors: [], ignoredSheets: [] };
  for (const { sheet, data } of sheets) {
    const name = normalize(sheet);
    if (HELPER_SHEETS.includes(name)) continue;
    const kind = (Object.keys(SHEET_NAMES) as ImportKind[]).find((k) => SHEET_NAMES[k].includes(name));
    if (!kind) {
      result.ignoredSheets.push(sheet);
      continue;
    }
    readSheet(kind, sheet, data, result);
  }
  return result;
}

function readSheet(kind: ImportKind, sheet: string, data: unknown[][], result: ReadResult) {
  const headerIndex = data.findIndex((row) => row.some((cell) => !isEmpty(cell)));
  if (headerIndex < 0) return;
  const { fields, required } = FIELDS[kind];

  const columnOf = new Map<Field, number>();
  data[headerIndex]!.forEach((cell, index) => {
    if (isEmpty(cell)) return;
    const header = normalize(String(cell));
    const field = fields.find((f) => COLUMNS[f].includes(header) && !columnOf.has(f));
    if (field) columnOf.set(field, index);
  });
  const missing = required.filter((f) => !columnOf.has(f));
  if (missing.length > 0) {
    result.errors.push({
      sheet,
      row: headerIndex + 1,
      message: `Başlık satırında ${missing.map((f) => `"${FIELD_LABEL[f]}"`).join(", ")} sütunu bulunamadı.`,
    });
    return;
  }

  for (let index = headerIndex + 1; index < data.length; index++) {
    const cells = data[index]!;
    if (!cells.some((cell) => !isEmpty(cell))) continue;
    const at = { sheet, row: index + 1 };
    const problems: string[] = [];
    const read = new CellReader((field) => {
      const column = columnOf.get(field);
      return column === undefined ? null : (cells[column] ?? null);
    }, problems);
    const row = build(kind, at, read);
    if (problems.length > 0) result.errors.push({ ...at, message: problems.join(" ") });
    else result.rows.push(row);
  }
}

/** Reads one row's cells as typed values, collecting what's wrong instead of throwing. */
class CellReader {
  constructor(
    readonly cell: (field: Field) => unknown,
    private readonly problems: string[],
  ) {}

  empty(field: Field) {
    return isEmpty(this.cell(field));
  }

  text(field: Field, required = false): string {
    const value = text(this.cell(field));
    if (required && !value) this.problems.push(`"${FIELD_LABEL[field]}" boş.`);
    return value ?? "";
  }

  optionalText(field: Field): string | undefined {
    return text(this.cell(field));
  }

  date(field: Field = "date"): SheetDate {
    const value = readDate(this.cell(field));
    if (!value) this.problems.push(`"${FIELD_LABEL[field]}" okunamadı (örnek: 15.03.2026).`);
    return value!;
  }

  optionalDate(field: Field): SheetDate | undefined {
    return this.empty(field) ? undefined : this.date(field);
  }

  /** A number in (0, max]; with `whole`, an integer of at least 1. */
  number(field: Field, max: number, whole = false): number {
    const value = readNumber(this.cell(field));
    const label = FIELD_LABEL[field];
    if (value === null) this.problems.push(`"${label}" sayı değil.`);
    else if (whole && (!Number.isInteger(value) || value < 1 || value > max)) {
      this.problems.push(`"${label}" 1 ile ${max.toLocaleString("tr")} arasında bir tam sayı olmalı.`);
    } else if (!whole && (value <= 0 || value > max)) {
      this.problems.push(`"${label}" 0'dan büyük ve en fazla ${max.toLocaleString("tr")} olmalı.`);
    } else return value;
    return 0;
  }

  optionalNumber(field: Field, max: number, whole = false): number | undefined {
    return this.empty(field) ? undefined : this.number(field, max, whole);
  }

  /** A value from a fixed list of words, or the default when the cell is empty. */
  choice<T>(field: Field, options: Record<string, T>, fallback: T, hint: string): T {
    if (this.empty(field)) return fallback;
    const value = options[normalize(String(this.cell(field)))];
    if (value === undefined) this.problems.push(`"${FIELD_LABEL[field]}" tanınmadı; şunlardan biri olmalı: ${hint}.`);
    return value ?? fallback;
  }

  yesNo(field: Field): boolean {
    if (this.empty(field)) return false;
    const value = normalize(String(this.cell(field)));
    if (YES.includes(value)) return true;
    if (!NO.includes(value)) this.problems.push(`"${FIELD_LABEL[field]}" Evet ya da Hayır olmalı.`);
    return false;
  }

  problem(message: string) {
    this.problems.push(message);
  }
}

function build(kind: ImportKind, at: Located, read: CellReader): ImportRow {
  if (kind === "farm") {
    return { kind, ...at, farmCode: read.text("farmCode", true), farmName: read.text("farmName", true) };
  }
  if (kind === "tank") {
    return {
      kind,
      ...at,
      farmCode: read.text("farmCode", true),
      sectionName: read.optionalText("sectionName"),
      tankCode: read.text("tankCode", true),
      tankType: read.choice("tankType", TANK_TYPES, "TANK", "Tank, Havuz, Kafes, Kanal"),
      volumeM3: read.optionalNumber("volumeM3", 1_000_000),
      maxBiomassKg: read.optionalNumber("maxBiomassKg", 10_000_000),
    };
  }

  const placed = {
    ...at,
    date: read.date(),
    tankCode: read.text("tankCode", true),
    farmCode: read.optionalText("farmCode"),
    notes: read.optionalText("notes"),
  };
  const lotCode = read.optionalText("lotCode");
  switch (kind) {
    case "batch":
      return {
        kind,
        ...placed,
        lotCode: read.text("lotCode", true),
        speciesName: read.text("speciesName", true),
        fishCount: read.number("fishCount", 100_000_000, true),
        avgWeightG: read.number("avgWeightG", 30_000),
        targetFcr: read.optionalNumber("targetFcr", 10),
        supplier: read.optionalText("supplier"),
      };
    case "feeding":
      return {
        kind,
        ...placed,
        lotCode,
        feedName: read.text("feedName", true),
        quantityKg: read.number("quantityKg", 20_000),
        unitPriceTry: read.optionalNumber("unitPriceTry", 100_000),
      };
    case "mortality":
      return {
        kind,
        ...placed,
        lotCode,
        fishCount: read.number("fishCount", 10_000_000, true),
        reason: read.choice("reason", REASONS, "UNKNOWN" as MortalityReason, REASON_HINT),
      };
    case "weighing":
      return { kind, ...placed, lotCode, sampleSize: read.number("sampleSize", 100_000, true), avgWeightG: read.number("avgWeightG", 30_000) };
    case "water": {
      if (!read.empty("time")) {
        const time = readTime(read.cell("time"));
        if (time && placed.date) Object.assign(placed.date, time);
        else if (!time) read.problem(`"Saat" okunamadı (örnek: 08:30).`);
      }
      const metrics: Partial<Record<WaterMetric, number>> = {};
      for (const metric of WATER_METRICS) {
        if (read.empty(metric)) continue;
        const value = readNumber(read.cell(metric));
        const [min, max] = WATER_RANGE[metric];
        if (value === null) read.problem(`"${FIELD_LABEL[metric]}" sayı değil.`);
        else if (value < min || value > max) read.problem(`"${FIELD_LABEL[metric]}" ${min}–${max} aralığında olmalı.`);
        else metrics[metric] = value;
      }
      if (Object.keys(metrics).length === 0 && WATER_METRICS.every((m) => read.empty(m))) {
        read.problem("En az bir ölçüm (sıcaklık, oksijen, pH…) girilmeli.");
      }
      return { kind, ...placed, metrics };
    }
    case "harvest":
      return {
        kind,
        ...placed,
        lotCode,
        fishCount: read.number("fishCount", 100_000_000, true),
        biomassKg: read.optionalNumber("biomassKg", 10_000_000),
        avgWeightG: read.optionalNumber("avgWeightG", 30_000),
        full: read.yesNo("full"),
        unitPriceTry: read.optionalNumber("unitPriceTry", 100_000),
        customer: read.optionalText("customer"),
      };
    case "transfer":
      return {
        kind,
        ...placed,
        lotCode,
        toFarmCode: read.optionalText("toFarmCode"),
        toTankCode: read.text("toTankCode", true),
        fishCount: read.number("fishCount", 100_000_000, true),
      };
    case "treatment":
      return {
        kind,
        ...placed,
        lotCode,
        treatmentType: read.choice("treatmentType", TREATMENT_TYPES, "MEDICATION" as TreatmentType, "İlaç, Aşı"),
        productName: read.text("productName", true),
        dosage: read.optionalText("dosage"),
        withdrawalDays: read.optionalNumber("withdrawalDays", 1000, true),
        endDate: read.optionalDate("endDate"),
      };
  }
}

function isEmpty(cell: unknown): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

function text(cell: unknown): string | undefined {
  if (isEmpty(cell)) return undefined;
  return (cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell)).trim();
}

/** "1.250,5" (Turkish), "1250.5", "1 250" or a number cell. Null when it isn't a number. */
export function readNumber(cell: unknown): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  let s = cell.trim().replace(/[\s  ]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Excel stores days since 1899-12-30; dates read from cells come back as UTC midnight. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function readDate(cell: unknown): SheetDate | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return fromUtc(cell);
  if (typeof cell === "number" && cell > 0 && cell < 100_000) return fromUtc(new Date(EXCEL_EPOCH + cell * 86_400_000));
  if (typeof cell !== "string") return null;
  const s = cell.trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?$/.exec(s);
  if (m) return checked(+m[3]!, +m[2]!, +m[1]!, m[4], m[5]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return checked(+m[1]!, +m[2]!, +m[3]!, m[4], m[5]);
  return null;
}

function readTime(cell: unknown): { hour: number; minute: number } | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return { hour: cell.getUTCHours(), minute: cell.getUTCMinutes() };
  if (typeof cell === "number" && cell >= 0 && cell < 1) {
    const minutes = Math.round(cell * 24 * 60);
    return { hour: Math.floor(minutes / 60) % 24, minute: minutes % 60 };
  }
  if (typeof cell !== "string") return null;
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(cell.trim());
  if (!m || +m[1]! > 23 || +m[2]! > 59) return null;
  return { hour: +m[1]!, minute: +m[2]! };
}

function fromUtc(date: Date): SheetDate | null {
  const result: SheetDate = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  if (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0) {
    result.hour = date.getUTCHours();
    result.minute = date.getUTCMinutes();
  }
  return result.year >= 1990 && result.year <= 2100 ? result : null;
}

function checked(year: number, month: number, day: number, hour?: string, minute?: string): SheetDate | null {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  if (year < 1990 || year > 2100) return null;
  const result: SheetDate = { year, month, day };
  if (hour !== undefined && minute !== undefined) {
    if (+hour > 23 || +minute > 59) return null;
    result.hour = +hour;
    result.minute = +minute;
  }
  return result;
}
