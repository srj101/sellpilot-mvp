import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@acme/ui/button";

const PLAN_LABEL = { growth: "Growth", pro: "Pro" } as const;

/**
 * Shared gating banner (UX/QA pass, docs/UX_QA_PASS.md) — pinned above a page/section that's
 * only partially or not available on the current plan. The page underneath still renders its
 * real UI; this just tells the owner what they're missing and links to Pricing, instead of the
 * old pattern of swapping the whole page for a single "Upgrade to see this" placeholder card.
 * Same visual language as trial-banner.tsx's persistent account-level banner.
 */
export function UpgradeBanner({
  businessSlug,
  feature,
  requiredPlan,
}: {
  businessSlug: string;
  feature: string;
  requiredPlan: "growth" | "pro";
}) {
  const planLabel = PLAN_LABEL[requiredPlan];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2.5">
        <Lock className="size-4 shrink-0 text-primary" />
        <span className="font-medium text-foreground">{feature} is a {planLabel} feature</span>
        <span className="hidden text-muted-foreground sm:inline">— upgrade to unlock it for this business</span>
      </div>
      <Link href={`/${businessSlug}/dashboard/pricing`}>
        <Button size="sm">Upgrade to {planLabel}</Button>
      </Link>
    </div>
  );
}
