"use client";

import type { BillingCycle } from "@acme/api/plans";
import { BILLING_CYCLES, CYCLE_META } from "@acme/api/plans";
import { cn } from "@acme/ui";

interface BillingCycleToggleProps {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  className?: string;
}

export function BillingCycleToggle({ value, onChange, className }: BillingCycleToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Billing cycle"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1 backdrop-blur",
        className,
      )}
    >
      {BILLING_CYCLES.map((cycle) => {
        const meta = CYCLE_META[cycle];
        const active = cycle === value;
        return (
          <button
            key={cycle}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(cycle)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {meta.label}
            {meta.discountPct > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                )}
              >
                −{meta.discountPct}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
