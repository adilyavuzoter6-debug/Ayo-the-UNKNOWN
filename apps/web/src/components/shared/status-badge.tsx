import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

export type StatusKind =
  | "active"
  | "warning"
  | "critical"
  | "empty"
  | "info"
  | "inactive";

const STATUS_CONFIG: Record<StatusKind, { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }> = {
  active: { label: "Aktif", variant: "success" },
  warning: { label: "Uyarı", variant: "warning" },
  critical: { label: "Kritik", variant: "destructive" },
  empty: { label: "Boş", variant: "secondary" },
  info: { label: "Bilgi", variant: "info" },
  inactive: { label: "Pasif", variant: "secondary" },
};

export function StatusBadge({
  status,
  label,
}: {
  status: StatusKind;
  /** Override the default Turkish label if needed. */
  label?: string;
}) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{label ?? config.label}</Badge>;
}
