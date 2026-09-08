import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Alert } from "@/lib/types";

export const ALERT_SEVERITY_STYLE: Record<
  string,
  { icon: typeof AlertCircle; text: string; bg: string }
> = {
  HIGH: { icon: AlertCircle, text: "text-destructive", bg: "bg-destructive/5" },
  MEDIUM: { icon: AlertTriangle, text: "text-warning", bg: "bg-warning/10" },
  LOW: { icon: AlertTriangle, text: "text-muted-foreground", bg: "bg-muted/40" },
};

export function AlertRow({
  alert,
  farmName,
  onResolve,
  resolving,
}: {
  alert: Alert;
  /** Shown alongside the message when the list isn't already scoped to one farm. */
  farmName?: string;
  onResolve?: () => void;
  resolving?: boolean;
}) {
  const style = ALERT_SEVERITY_STYLE[alert.severity] ?? ALERT_SEVERITY_STYLE.LOW!;
  const Icon = style.icon;

  return (
    <div
      className={`flex items-start gap-2.5 border-b border-border px-4.5 py-2.5 last:border-b-0 ${style.bg}`}
    >
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${style.text}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs leading-snug text-foreground">{alert.message}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground/80">
          {farmName ? `${farmName} · ` : ""}
          {new Date(alert.createdAt).toLocaleString("tr")}
        </div>
      </div>
      {onResolve ? (
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={resolving}
          onClick={onResolve}
          aria-label="Çözüldü"
        >
          <CheckCircle2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
