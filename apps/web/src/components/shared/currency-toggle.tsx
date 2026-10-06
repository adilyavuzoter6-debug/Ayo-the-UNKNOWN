"use client";

import { cn } from "@/lib/utils";
import type { ExchangeCurrency } from "@/lib/types";

export const CURRENCY_SYMBOL: Record<ExchangeCurrency, string> = { TRY: "₺", USD: "$", EUR: "€" };

/** Segmented control for picking a currency. Sized to sit beside a form label. */
export function CurrencyToggle({
  value,
  onChange,
  options = ["TRY", "USD", "EUR"],
}: {
  value: ExchangeCurrency;
  onChange: (next: ExchangeCurrency) => void;
  options?: ExchangeCurrency[];
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-xs">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "px-2.5 py-1 font-medium transition-colors",
            value === c ? "bg-teal-500 text-white" : "bg-transparent text-muted-foreground hover:bg-muted",
          )}
        >
          {CURRENCY_SYMBOL[c]}
        </button>
      ))}
    </div>
  );
}
