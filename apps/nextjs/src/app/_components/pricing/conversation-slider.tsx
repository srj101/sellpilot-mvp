"use client";

import { useState, useMemo, useCallback } from "react";
import { MessageSquare, Plus, Minus } from "lucide-react";

import type { PlanKey } from "@acme/api/plans";
import { PLAN_CATALOG, OVERAGE_RATES } from "@acme/api/plans";
import { cn, Slider } from "@acme/ui";

interface ConversationSliderProps {
  plan: PlanKey;
  baseConversations: number;
  onChange: (extraConversations: number, extraCost: number) => void;
  className?: string;
}

/** Step sizes for the slider — each step adds this many conversations. */
const STEP_SIZE = 500;

/** Maximum extra conversations beyond base plan (capped at 3x base). */
const MAX_MULTIPLIER = 3;

export function ConversationSlider({
  plan,
  baseConversations,
  onChange,
  className,
}: ConversationSliderProps) {
  const maxExtra = baseConversations * MAX_MULTIPLIER;
  const [extra, setExtra] = useState(0);

  const overageRate = OVERAGE_RATES[plan];

  const extraCost = useMemo(() => {
    if (!overageRate || extra <= 0) return 0;
    const blocks = Math.ceil(extra / overageRate.blockSize);
    return blocks * overageRate.pricePerBlock;
  }, [extra, overageRate]);

  const totalConversations = baseConversations + extra;

  const handleChange = useCallback(
    (value: number[]) => {
      const next = value[0] ?? 0;
      const clamped = Math.max(0, Math.min(maxExtra, next));
      setExtra(clamped);
      onChange(
        clamped,
        Math.ceil(clamped / (overageRate?.blockSize ?? 500)) *
          (overageRate?.pricePerBlock ?? 0),
      );
    },
    [maxExtra, onChange, overageRate],
  );

  const increment = useCallback(() => {
    const next = Math.min(maxExtra, extra + STEP_SIZE);
    setExtra(next);
    onChange(
      next,
      Math.ceil(next / (overageRate?.blockSize ?? 500)) *
        (overageRate?.pricePerBlock ?? 0),
    );
  }, [extra, maxExtra, onChange, overageRate]);

  const decrement = useCallback(() => {
    const next = Math.max(0, extra - STEP_SIZE);
    setExtra(next);
    onChange(
      next,
      Math.ceil(next / (overageRate?.blockSize ?? 500)) *
        (overageRate?.pricePerBlock ?? 0),
    );
  }, [extra, onChange, overageRate]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">AI Conversations</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-foreground">
            {totalConversations.toLocaleString()}
          </span>
          {extra > 0 && (
            <span className="text-muted-foreground">
              ({baseConversations.toLocaleString()} +{" "}
              {extra.toLocaleString()})
            </span>
          )}
        </div>
      </div>

      {/* Slider row */}
      <div className="flex items-center gap-3">
        <button
          onClick={decrement}
          disabled={extra <= 0}
          className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Decrease conversations"
        >
          <Minus className="size-3.5" />
        </button>

        <Slider
          value={[extra]}
          onValueChange={handleChange}
          min={0}
          max={maxExtra}
          step={STEP_SIZE}
          className="flex-1"
        />

        <button
          onClick={increment}
          disabled={extra >= maxExtra}
          className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Increase conversations"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Base ({baseConversations.toLocaleString()})</span>
        <span>Up to {maxExtra.toLocaleString()} extra</span>
      </div>

      {/* Extra cost display */}
      {extra > 0 && overageRate && (
        <div className="rounded-lg border border-primary/10 bg-primary/5 px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              +{extra.toLocaleString()} extra conversations
            </span>
            <span className="font-semibold text-primary">
              +৳{extraCost.toLocaleString("en-US")}/mo
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Billed in {overageRate.blockSize.toLocaleString()}-conversation
            blocks at ৳{overageRate.pricePerBlock.toLocaleString("en-US")}/block
          </p>
        </div>
      )}
    </div>
  );
}
