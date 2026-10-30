import type { MortalityReason } from "@prisma/client";

/**
 * Turns the sheets of an uploaded workbook into typed rows, one kind per sheet: feeding, mortality,
 * weighings and water quality. Pure: it knows nothing of tanks or batches (ImportsService resolves
 * those); it only reads cells. Built for the files farms actually keep, so it is forgiving about
 * how things are written — sheet and column names in any case and with or without Turkish
 * letters, dates as Excel dates or "15.03.2026", numbers as "1.250,5" — and strict about what
 * they mean: a row it can't read is reported with its sheet and row number, never guessed at.
 */

export type ImportKind = "feeding" | "mortality" | "weighing" | "water";

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

interface Placed extends Located {
  date: SheetDate;
  farmCode?: string;
  tankCode: string;
  notes?: string;
}

export interface FeedingRow extends Placed {
  kind: "feeding";
  lotCode?: string;
  feedName: string;
  quantityKg: number;
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

export type ImportRow = FeedingRow | MortalityRow | WeighingRow | WaterRow;

export interface RowError extends Located {
  message: string;
}

export interface ReadResult {
  rows: ImportRow[];
  errors: RowError[];
  /** Sheets that matched no kind (an instructions tab, say); reported, not read. */
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
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

/** The template's own instruction and reference tabs: skipped without mention. */
const HELPER_SHEETS = ["nasildoldurulur", "kodlariniz", "aciklama", "aciklamalar"];

const SHEET_NAMES: Record<ImportKind, string[]> = {
  feeding: ["yemleme", "yem", "yemlemeler"],
  mortality: ["olum", "olumler", "mortalite"],
  weighing: ["tartim", "tartimlar", "agirlik", "ornekleme"],
  water: ["sukalitesi", "su", "suolcumleri", "suolcumu"],
};

type Field =
  | "date"
  | "time"
  | "farmCode"
  | "tankCode"
  | "lotCode"
  | "notes"
  | "feedName"
  | "quantityKg"
  | "fishCount"
  | "reason"
  | "sampleSize"
  | "avgWeightG"
  | WaterMetric;

/** Column names each field answers to, normalized. The template's own header comes first. */
const COLUMNS: Record<Field, string[]> = {
  date: ["tarih"],
  time: ["saat"],
  farmCode: ["ciftlikkodu", "ciftlik"],
  tankCode: ["tankkodu", "tank", "kafeskodu", "kafes", "havuzkodu", "havuz"],
  lotCode: ["partikodu", "parti", "lotkodu", "lot"],
  notes: ["not", "notlar", "aciklama"],
  feedName: ["yem", "yemadi", "yemurunu", "urun"],
  quantityKg: ["miktarkg", "miktar", "yemkg", "kg"],
  fishCount: ["adet", "oluadedi", "olumadedi", "olusayisi"],
  reason: ["sebep", "neden", "olumsebebi"],
  sampleSize: ["ornekadedi", "ornek", "tartilanbalik", "tartilanadet"],
  avgWeightG: ["ortalamaagirlikg", "ortalamaagirlik", "ortagirlikg", "agirlikg", "gram"],
  temperatureC: ["sicaklikc", "sicaklik", "susicakligi"],
  dissolvedOxygenMgL: ["cozunmusoksijenmgl", "cozunmusoksijen", "oksijenmgl", "oksijen"],
  ph: ["ph"],
  ammoniaMgL: ["amonyakmgl", "amonyak"],
  nitriteMgL: ["nitritmgl", "nitrit"],
  nitrateMgL: ["nitratmgl", "nitrat"],
  salinityPpt: ["tuzlulukppt", "tuzluluk"],
};

const SHARED: Field[] = ["date", "farmCode", "tankCode", "notes"];
const FIELDS: Record<ImportKind, { fields: Field[]; required: Field[] }> = {
  feeding: { fields: [...SHARED, "lotCode", "feedName", "quantityKg"], required: ["date", "tankCode", "feedName", "quantityKg"] },
  mortality: { fields: [...SHARED, "lotCode", "fishCount", "reason"], required: ["date", "tankCode", "fishCount"] },
  weighing: { fields: [...SHARED, "lotCode", "sampleSize", "avgWeightG"], required: ["date", "tankCode", "sampleSize", "avgWeightG"] },
  water: { fields: [...SHARED, "time", ...WATER_METRICS], required: ["date", "tankCode"] },
};

const FIELD_LABEL: Record<Field, string> = {
  date: "Tarih",
  time: "Saat",
  farmCode: "Çiftlik kodu",
  tankCode: "Tank kodu",
  lotCode: "Parti kodu",
  notes: "Not",
  feedName: "Yem",
  quantityKg: "Miktar (kg)",
  fishCount: "Adet",
  reason: "Sebep",
  sampleSize: "Örnek adedi",
  avgWeightG: "Ortalama ağırlık (g)",
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
    const cell = (field: Field) => {
      const column = columnOf.get(field);
      return column === undefined ? null : (cells[column] ?? null);
    };
    const problems: string[] = [];

    const date = readDate(cell("date"));
    if (!date) problems.push(`"Tarih" okunamadı (örnek: 15.03.2026).`);
    if (kind === "water" && !isEmpty(cell("time"))) {
      const time = readTime(cell("time"));
      if (time && date) Object.assign(date, time);
      else if (!time) problems.push(`"Saat" okunamadı (örnek: 08:30).`);
    }
    const tankCode = text(cell("tankCode"));
    if (!tankCode) problems.push(`"Tank kodu" boş.`);
    const base = {
      ...at,
      date: date!,
      tankCode: tankCode!,
      farmCode: text(cell("farmCode")),
      notes: text(cell("notes")),
    };

    let row: ImportRow | null = null;
    if (kind === "feeding") {
      const feedName = text(cell("feedName"));
      if (!feedName) problems.push(`"Yem" boş.`);
      const quantityKg = positive(cell("quantityKg"), "Miktar (kg)", problems, 20_000);
      row = { kind, ...base, lotCode: text(cell("lotCode")), feedName: feedName!, quantityKg: quantityKg! };
    } else if (kind === "mortality") {
      const fishCount = wholeNumber(cell("fishCount"), "Adet", problems);
      let reason: MortalityReason = "UNKNOWN";
      if (!isEmpty(cell("reason"))) {
        const known = REASONS[normalize(String(cell("reason")))];
        if (known) reason = known;
        else problems.push(`"Sebep" tanınmadı; şunlardan biri olmalı: ${REASON_HINT}.`);
      }
      row = { kind, ...base, lotCode: text(cell("lotCode")), fishCount: fishCount!, reason };
    } else if (kind === "weighing") {
      const sampleSize = wholeNumber(cell("sampleSize"), "Örnek adedi", problems);
      const avgWeightG = positive(cell("avgWeightG"), "Ortalama ağırlık (g)", problems, 30_000);
      row = { kind, ...base, lotCode: text(cell("lotCode")), sampleSize: sampleSize!, avgWeightG: avgWeightG! };
    } else {
      const metrics: Partial<Record<WaterMetric, number>> = {};
      for (const metric of WATER_METRICS) {
        if (isEmpty(cell(metric))) continue;
        const value = readNumber(cell(metric));
        const [min, max] = WATER_RANGE[metric];
        if (value === null) problems.push(`"${FIELD_LABEL[metric]}" sayı değil.`);
        else if (value < min || value > max) problems.push(`"${FIELD_LABEL[metric]}" ${min}–${max} aralığında olmalı.`);
        else metrics[metric] = value;
      }
      if (Object.keys(metrics).length === 0 && problems.length === 0) {
        problems.push("En az bir ölçüm (sıcaklık, oksijen, pH…) girilmeli.");
      }
      row = { kind, ...base, metrics };
    }

    if (problems.length > 0) result.errors.push({ ...at, message: problems.join(" ") });
    else result.rows.push(row);
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

function positive(cell: unknown, label: string, problems: string[], max: number): number | undefined {
  const value = readNumber(cell);
  if (value === null) problems.push(`"${label}" sayı değil.`);
  else if (value <= 0 || value > max) problems.push(`"${label}" 0'dan büyük ve en fazla ${max.toLocaleString("tr")} olmalı.`);
  else return value;
  return undefined;
}

function wholeNumber(cell: unknown, label: string, problems: string[]): number | undefined {
  const value = readNumber(cell);
  if (value === null || !Number.isInteger(value) || value < 1 || value > 10_000_000) {
    problems.push(`"${label}" 1 veya daha büyük bir tam sayı olmalı.`);
    return undefined;
  }
  return value;
}

/** Excel stores days since 1899-12-30; dates read from cells come back as UTC midnight. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function readDate(cell: unknown): SheetDate | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return fromUtc(cell, true);
  if (typeof cell === "number" && cell > 0 && cell < 100_000) return fromUtc(new Date(EXCEL_EPOCH + cell * 86_400_000), true);
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

function fromUtc(date: Date, withTime: boolean): SheetDate | null {
  const result: SheetDate = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  if (withTime && (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0)) {
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
