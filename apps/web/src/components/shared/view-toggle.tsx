import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "card" | "table";

export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { value: "card", label: "Kart", icon: LayoutGrid },
    { value: "table", label: "Tablo", icon: TableIcon },
  ];

  return (
    <div className="flex overflow-hidden rounded-md border border-border bg-card">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
