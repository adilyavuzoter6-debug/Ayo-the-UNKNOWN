"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Sample projection of the landing page's demo farm (184.250 fish, 42,6 t today), shaped like the
// app's "Gramaj Dağılımı Tahmini": 50 g ranges, fish per range, a little loss each month.
const MONTHS = {
  1: {
    buckets: [
      [150, 24_300],
      [200, 47_900],
      [250, 58_200],
      [300, 37_100],
      [350, 14_400],
    ],
    totalKg: 48_500,
  },
  3: {
    buckets: [
      [200, 18_600],
      [250, 41_900],
      [300, 56_300],
      [350, 40_700],
      [400, 19_700],
    ],
    totalKg: 57_600,
  },
  6: {
    buckets: [
      [300, 14_200],
      [350, 38_900],
      [400, 55_600],
      [450, 41_300],
      [500, 20_800],
    ],
    totalKg: 73_300,
  },
} as const;
type Month = keyof typeof MONTHS;

const fmt = (n: number, digits = 0) => n.toLocaleString("tr", { maximumFractionDigits: digits });

/** The sample farm's weight distribution 1, 3 or 6 months ahead, one bar per 50 g range. */
export function ForecastPreview() {
  const [month, setMonth] = React.useState<Month>(6);
  const { buckets, totalKg } = MONTHS[month];
  const total = buckets.reduce((sum, [, count]) => sum + count, 0);
  const max = Math.max(...buckets.map(([, count]) => count));
  const marketSize = buckets.filter(([start]) => start >= 300).reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-teal-500/15">
            <Sparkles className="size-3.5 text-teal-500" />
          </span>
          <span className="font-display text-sm font-semibold">Büyüme tahmini</span>
        </div>
        <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Kaç ay sonra">
          {([1, 3, 6] as Month[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={month === m}
              onClick={() => setMonth(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                month === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m} ay
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pt-3">
        <div>
          <div className="text-[10px] text-muted-foreground">Balık</div>
          <div className="font-mono text-sm font-semibold">{fmt(total)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Biyokütle</div>
          <div className="font-mono text-sm font-semibold">{fmt(totalKg / 1000, 1)} t</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Ort. ağırlık</div>
          <div className="font-mono text-sm font-semibold">{fmt((totalKg * 1000) / total)} g</div>
        </div>
      </div>

      <div className="flex-1 space-y-1.5 px-4 py-3">
        {buckets.map(([start, count]) => (
          <div key={start} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 shrink-0 font-mono text-muted-foreground">
              {start}–{start + 50} g
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
              <div
                className={cn(
                  "h-full rounded transition-all duration-500",
                  start >= 300 ? "bg-gradient-to-r from-teal-500 to-teal-400" : "bg-navy-600/60",
                )}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-foreground">{fmt(count)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-teal-500/5 px-4 py-2 text-[11px] text-foreground">
        <span className="font-semibold text-teal-600 dark:text-teal-400">{fmt(marketSize)} balık</span> {month} ay sonra
        hasat boyunda (300 g+) · partilerin kendi tartımları, su sıcaklığı ve ölüm verisinden
      </div>
    </div>
  );
}
