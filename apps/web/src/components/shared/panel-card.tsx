import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Bordered card with a title row and optional right-aligned text action — the
 * repeating "panel" shell used for dashboard charts, alert/task lists, and data tables. */
export function PanelCard({
  title,
  action,
  onAction,
  className,
  contentClassName,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 border-b border-border py-3">
        <CardTitle className="font-display text-sm font-semibold">{title}</CardTitle>
        {action ? (
          <button
            type="button"
            onClick={onAction}
            className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-teal-500 hover:underline"
          >
            {action}
            <ChevronRight className="size-3" />
          </button>
        ) : null}
      </CardHeader>
      <CardContent className={cn("p-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
