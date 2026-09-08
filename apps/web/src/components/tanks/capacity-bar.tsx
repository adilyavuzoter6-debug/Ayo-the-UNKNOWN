import { cn } from "@/lib/utils";

/**
 * Same 90% threshold as the backend's biomass-capacity alert rule
 * (apps/api/src/modules/alerts/alerts.service.ts BIOMASS_ALERT_THRESHOLD_RATIO) — this bar
 * turns the color the app would already be alerting on, not an arbitrary new scale.
 */
const WARNING_RATIO = 0.7;
const CRITICAL_RATIO = 0.9;

export function CapacityBar({
  biomassKg,
  maxBiomassKg,
  className,
}: {
  biomassKg: number;
  maxBiomassKg: number | null;
  className?: string;
}) {
  if (!maxBiomassKg || maxBiomassKg <= 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Maksimum biyokütle tanımlı değil.
      </p>
    );
  }

  const ratio = Math.min(biomassKg / maxBiomassKg, 1);
  const pct = Math.round(ratio * 100);
  const barColor =
    ratio >= CRITICAL_RATIO ? "bg-destructive" : ratio >= WARNING_RATIO ? "bg-warning" : "bg-teal-500";
  const textColor =
    ratio >= CRITICAL_RATIO
      ? "text-destructive"
      : ratio >= WARNING_RATIO
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Kapasite kullanımı"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn("text-right text-[11px] font-medium", textColor)}>%{pct} kapasite</p>
    </div>
  );
}
