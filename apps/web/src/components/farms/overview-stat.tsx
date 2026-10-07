import type * as React from "react";

/** One small labelled stat tile — shared by the farm overview and each block's detail row. */
export function OverviewStat({
  icon: Icon,
  label,
  value,
  accent,
  warn,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const valueClass = warn ? "text-warning" : accent ? "text-teal-500" : "text-foreground";
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
        {Icon && <Icon className="size-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`truncate font-mono text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}
