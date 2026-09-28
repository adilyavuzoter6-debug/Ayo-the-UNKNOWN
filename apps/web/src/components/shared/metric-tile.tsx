/** Label + big mono number stat tile — the "4-up metric grid" idiom used for latest readings. */
export function MetricTile({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  /** Optional verdict line under the number, e.g. whether a reading is in a safe band. */
  note?: { label: string; className: string };
}) {
  const display = value !== null ? Number(value).toString() : null;
  return (
    <div className="border-r border-b border-border px-4.5 py-4 last:border-r-0">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[22px] font-bold text-foreground">
        {display ?? "—"}
        {display !== null && unit ? (
          <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      {display !== null && note ? (
        <div className={`mt-0.5 text-[11px] font-medium ${note.className}`}>{note.label}</div>
      ) : null}
    </div>
  );
}
