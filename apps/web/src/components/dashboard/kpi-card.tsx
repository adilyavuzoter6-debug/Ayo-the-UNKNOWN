import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  icon: Icon,
  color,
  label,
  value,
  unit,
  change,
  changeDir = "neutral",
  sub,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  unit?: string;
  change?: string;
  changeDir?: "up" | "down" | "neutral";
  sub?: string;
}) {
  const changeColor =
    changeDir === "up" ? "text-success" : changeDir === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-4.5 py-4">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
        <div
          className="flex size-7.5 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}1a` }}
        >
          <Icon className="size-3.5" style={{ color }} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[22px] leading-none font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {(change || sub) && (
        <div className="flex items-center gap-1.5">
          {change && (
            <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", changeColor)}>
              {changeDir === "up" ? (
                <TrendingUp className="size-2.5" />
              ) : changeDir === "down" ? (
                <TrendingDown className="size-2.5" />
              ) : null}
              {change}
            </span>
          )}
          {sub && <span className="text-[11px] text-muted-foreground/80">{sub}</span>}
        </div>
      )}
    </div>
  );
}
