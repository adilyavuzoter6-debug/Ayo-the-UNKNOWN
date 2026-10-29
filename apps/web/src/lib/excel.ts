/** A value an Excel cell can hold; null leaves the cell empty. */
export type ExcelValue = string | number | Date | null;

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => ExcelValue;
  /** Width in characters. */
  width?: number;
  /** Excel number format, e.g. "#,##0.00" or "dd.mm.yyyy hh:mm". */
  format?: string;
}

export interface ExcelSheet<T> {
  /** Sheet tab name; Excel allows at most 31 characters. */
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

export const EXCEL_DATE = "dd.mm.yyyy";
export const EXCEL_DATE_TIME = "dd.mm.yyyy hh:mm";
export const EXCEL_INT = "#,##0";
export const EXCEL_DECIMAL = "#,##0.00";

/** An ISO timestamp as a Date for a date-formatted cell, or null. */
export function excelDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

/**
 * Builds an .xlsx file in the browser and downloads it: one tab per sheet, a bold frozen header
 * row, and typed cells so numbers and dates stay sortable and summable in Excel. The writer is
 * loaded on first use, so pages that never export don't carry it.
 */
// Sheets of different row types go in one call, so the element type is erased here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function downloadExcel(fileName: string, sheets: ExcelSheet<any>[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.name.slice(0, 31),
      stickyRowsCount: 1,
      columns: sheet.columns.map((c) => ({ width: c.width ?? Math.max(10, c.header.length + 2) })),
      data: [
        sheet.columns.map((c) => ({ value: c.header, fontWeight: "bold" as const, wrap: true })),
        ...sheet.rows.map((row) =>
          sheet.columns.map((c) => {
            const value = c.value(row);
            if (value === null) return null;
            if (value instanceof Date) return { value, type: Date, format: c.format ?? EXCEL_DATE };
            if (typeof value === "number") return { value, type: Number, format: c.format };
            return { value, type: String };
          }),
        ),
      ],
    })),
    { fontFamily: "Calibri", fontSize: 11 },
  ).toFile(fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
