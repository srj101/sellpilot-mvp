"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, HelpCircle, Truck, Wallet } from "lucide-react";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

/** Mirrors formatRelativeTimeShort in the inbox feature's inbox-utils.tsx — kept local
 * since this codebase keeps small time-formatting helpers per-feature, not shared. */
function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

type PillState = "not-configured" | "not-verified" | "connected" | "unavailable" | "error";

function pillClasses(state: PillState) {
  switch (state) {
    case "connected":
      return "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400";
    case "error":
      return "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400";
    case "not-verified":
      return "border-muted-foreground/20 bg-muted/40 text-muted-foreground";
    default:
      return "border-amber-500/30 bg-amber-500/5 text-amber-600";
  }
}

function pillIcon(state: PillState) {
  if (state === "connected") return <CheckCircle2 className="size-3.5" />;
  if (state === "not-verified") return <HelpCircle className="size-3.5" />;
  return <CircleAlert className="size-3.5" />;
}

function pillLabel(state: PillState) {
  switch (state) {
    case "connected":
      return "Connected";
    case "not-verified":
      return "Not verified yet";
    case "unavailable":
      return "Not available";
    case "error":
      return "Verification failed";
    default:
      return "Not configured";
  }
}

function MethodPill({ label, state, checkedAt }: { label: string; state: PillState; checkedAt?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium", pillClasses(state))}>
      <Wallet className="size-3.5" />
      {label}
      {pillIcon(state)}
      <span className="font-semibold">{pillLabel(state)}</span>
      {checkedAt && state !== "not-configured" && state !== "not-verified" && (
        <span className="text-muted-foreground">· checked {timeAgo(checkedAt)}</span>
      )}
    </div>
  );
}

export function MethodStatusStrip() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.payments.getGatewayStatus.queryOptions());

  const stateFor = (active: boolean | undefined): PillState => {
    if (!data?.hasCredentials) return "not-configured";
    if (!data.gateway) return "not-verified";
    if (data.gateway.status === "error") return "error";
    return active ? "connected" : "unavailable";
  };

  const checkedAt = data?.gateway?.checkedAt;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MethodPill label="bKash" state={stateFor(data?.gateway?.bkash)} checkedAt={checkedAt} />
      <MethodPill label="Nagad" state={stateFor(data?.gateway?.nagad)} checkedAt={checkedAt} />
      <MethodPill
        label="Card · Bank"
        state={stateFor(data?.gateway ? data.gateway.card || data.gateway.internetBanking : undefined)}
        checkedAt={checkedAt}
      />
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Truck className="size-3.5" />
        Cash on Delivery
        <CheckCircle2 className="size-3.5" />
        <span className="font-semibold">Enabled</span>
      </div>
    </div>
  );
}
