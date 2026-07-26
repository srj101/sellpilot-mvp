"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

/** Persistent trial-status banner (tracker 10.1) — every member sees it, only the owner's
 * "Upgrade Now" click actually does anything (subscription.subscribe is owner-only). */
export function TrialBanner({ businessSlug }: { businessSlug: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.subscription.getTrialStatus.queryOptions());

  if (!data?.isTrialing) return null;

  const urgent = data.daysRemaining <= 3;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        urgent ? "border-amber-500/30 bg-amber-500/10" : "border-primary/20 bg-primary/5"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Sparkles className={urgent ? "size-4 text-amber-600" : "size-4 text-primary"} />
        <span className="font-medium text-foreground">
          {data.daysRemaining} day{data.daysRemaining === 1 ? "" : "s"} left in your free trial
        </span>
        {!data.hasPaymentMethod && (
          <span className="hidden text-muted-foreground sm:inline">— add a payment method to avoid interruption</span>
        )}
      </div>
      <Link href={`/${businessSlug}/dashboard/pricing`}>
        <Button size="sm" variant={urgent ? "default" : "outline"}>
          Upgrade Now
        </Button>
      </Link>
    </div>
  );
}
