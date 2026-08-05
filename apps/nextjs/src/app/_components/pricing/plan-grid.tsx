"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, Crown, Rocket, Sparkles, TrendingUp } from "lucide-react";

import type { BillingCycle, PlanKey } from "@acme/api/plans";
import { CYCLE_META, PLAN_CATALOG, PLAN_KEYS, formatPlanPrice, OVERAGE_RATES } from "@acme/api/plans";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@acme/ui/card";
import { cn } from "@acme/ui";

import { BillingCycleToggle } from "./billing-cycle-toggle";
import { ConversationSlider } from "./conversation-slider";

interface DashboardPlanState {
  currentPlan: PlanKey | null;
  isTrialing: boolean;
  pendingPlan: PlanKey | null;
}

/** One visual identity per tier — a quick glance beats reading the name (lucide icons,
 * never emoji, so they render identically across every OS/browser). */
const PLAN_ICON: Record<PlanKey, typeof Rocket> = {
  starter: Rocket,
  growth: TrendingUp,
  pro: Crown,
};

const PLAN_ICON_STYLE: Record<PlanKey, string> = {
  starter: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  growth: "bg-primary/10 text-primary",
  pro: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

interface PlanGridProps {
  mode: "public" | "dashboard";
  /** Only meaningful in "dashboard" mode. */
  dashboardState?: DashboardPlanState;
  /** Called only in "dashboard" mode when the owner picks a plan+cycle. */
  onChoosePlan?: (plan: PlanKey, cycle: BillingCycle) => void;
  /** Disables all CTAs while a checkout mutation is in flight. */
  busyPlan?: PlanKey | null;
  initialCycle?: BillingCycle;
  className?: string;
  /** Tighter cards (smaller type, tighter spacing) for the public /pricing page — every
   * feature is still listed in a single readable column, none hidden or truncated.
   * Dashboard contexts keep the full comfortable layout since they already live inside a
   * scrolling app shell. */
  compact?: boolean;
}

export function PlanGrid({
  mode,
  dashboardState,
  onChoosePlan,
  busyPlan,
  initialCycle = "monthly",
  className,
  compact = false,
}: PlanGridProps) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [extraConversations, setExtraConversations] = useState<Record<PlanKey, number>>({
    starter: 0,
    growth: 0,
    pro: 0,
  });
  const [extraCosts, setExtraCosts] = useState<Record<PlanKey, number>>({
    starter: 0,
    growth: 0,
    pro: 0,
  });

  const handleConversationChange = useCallback((plan: PlanKey, extra: number, cost: number) => {
    setExtraConversations((prev) => ({ ...prev, [plan]: extra }));
    setExtraCosts((prev) => ({ ...prev, [plan]: cost }));
  }, []);

  const getDisplayPrice = (plan: PlanKey, basePrice: number | null): number | null => {
    if (basePrice === null) return null;
    return basePrice + extraCosts[plan];
  };

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-4" : "gap-8", className)}>
      <BillingCycleToggle value={cycle} onChange={setCycle} />

      <div className={cn("grid w-full md:grid-cols-3", compact ? "gap-3 lg:gap-4" : "gap-6")}>
        {PLAN_KEYS.map((key) => {
          const plan = PLAN_CATALOG[key];
          const basePrice = plan.prices[cycle];
          const displayPrice = getDisplayPrice(key, basePrice);
          const isLifetimeUnpriced = cycle === "lifetime" && basePrice === null;
          const isCurrent = mode === "dashboard" && dashboardState?.currentPlan === key;
          const isPending = mode === "dashboard" && dashboardState?.pendingPlan === key;
          const isBusy = busyPlan === key;
          const Icon = PLAN_ICON[key];
          const hasSlider = !compact && !isLifetimeUnpriced && cycle === "monthly";

          return (
            <Card
              key={key}
              className={cn(
                "relative flex flex-col transition-shadow",
                compact ? "py-4" : "py-6",
                plan.popular ? cn("border-primary/60 shadow-lg shadow-primary/10", !compact && "md:-translate-y-2") : "shadow-xs",
                isCurrent && "ring-2 ring-primary/40",
              )}
            >
              {plan.popular && (
                <div className={cn("absolute left-1/2 -translate-x-1/2", compact ? "-top-3" : "-top-3")}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
                    <Sparkles className="size-3" />
                    Most Popular
                  </span>
                </div>
              )}

              <CardHeader className={cn("gap-2", compact ? "px-4 pb-1" : "px-6 pb-2")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center justify-center rounded-xl",
                        compact ? "size-8" : "size-9",
                        PLAN_ICON_STYLE[key],
                      )}
                    >
                      <Icon className={compact ? "size-4" : "size-[18px]"} />
                    </span>
                    <CardTitle className={compact ? "text-base" : "text-lg"}>{plan.name}</CardTitle>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {dashboardState.isTrialing ? "Current · Trial" : "Your plan"}
                    </span>
                  )}
                  {isPending && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      Scheduled
                    </span>
                  )}
                </div>
                {!compact && <CardDescription>{plan.tagline}</CardDescription>}
              </CardHeader>

              <CardContent className={cn("flex flex-1 flex-col", compact ? "gap-3 px-4" : "gap-5 px-6")}>
                <div className="flex items-baseline gap-1.5 border-b pb-3">
                  <span className={cn("font-bold tracking-tight", compact ? "text-2xl" : "text-3xl")}>
                    {isLifetimeUnpriced ? "Contact Sales" : formatPlanPrice(displayPrice)}
                    {key === "pro" && !isLifetimeUnpriced && <span className="font-bold">+</span>}
                  </span>
                  {!isLifetimeUnpriced && (
                    <span className="text-sm font-medium text-muted-foreground">{CYCLE_META[cycle].shortLabel}</span>
                  )}
                </div>
                {key === "pro" && !compact && (
                  <p className="-mt-4 text-xs text-muted-foreground">
                    Custom pricing above Fair Use volumes.
                  </p>
                )}

                <ul className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={cn("flex items-start gap-1.5", compact ? "text-xs leading-snug" : "text-sm")}
                    >
                      <Check className={cn("shrink-0 text-primary", compact ? "mt-0.5 size-3.5" : "mt-0.5 size-4")} />
                      <span className="text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Conversation Slider — only on dashboard, monthly cycle, non-lifetime */}
                {hasSlider && (
                  <div className="mt-2 border-t pt-4">
                    <ConversationSlider
                      plan={key}
                      baseConversations={plan.limits.aiConversationsPerMonth ?? 0}
                      onChange={(extra, cost) => handleConversationChange(key, extra, cost)}
                    />
                  </div>
                )}
              </CardContent>

              <CardFooter className={cn("flex flex-col", compact ? "gap-1 px-4" : "gap-2 px-6")}>
                {mode === "public" ? (
                  <>
                    <Button asChild className="w-full" size={compact ? "sm" : "default"} variant={plan.popular ? "default" : "outline"}>
                      <Link href={isLifetimeUnpriced ? "/demo" : `/signup?plan=${key}&cycle=${cycle}${extraConversations[key] > 0 ? `&extra=${extraConversations[key]}` : ""}`}>
                        {isLifetimeUnpriced ? "Contact Sales" : "Start Free Trial"}
                      </Link>
                    </Button>
                    {compact ? (
                      <Link href="/demo" className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline">
                        or Request a Demo
                      </Link>
                    ) : (
                      <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground">
                        <Link href="/demo">Request Demo</Link>
                      </Button>
                    )}
                  </>
                ) : isCurrent ? (
                  <Button className="w-full" variant="outline" disabled>
                    {dashboardState.isTrialing ? "Your trial plan" : "Your current plan"}
                  </Button>
                ) : isLifetimeUnpriced ? (
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/demo">Contact Sales</Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    disabled={isBusy}
                    onClick={() => onChoosePlan?.(key, cycle)}
                  >
                    {isBusy ? "Redirecting…" : isPending ? "Change scheduled plan" : "Choose Plan"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
