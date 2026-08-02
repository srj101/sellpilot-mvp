"use client";

import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";

import { useTRPC } from "~/trpc/react";

// FR-INB-04 — polled, not pushed live: a "things are busy" signal has no need for
// sub-second latency, so a simple interval is enough (see queue-status.ts on the API
// side for why this reads platform-wide, not per-business, queue depth).
const POLL_INTERVAL_MS = 10_000;

export function HighTrafficBanner() {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.inbox.getQueueStatus.queryOptions(), refetchInterval: POLL_INTERVAL_MS });

  if (!data?.isHighTraffic) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
      <Zap className="h-3.5 w-3.5 shrink-0" />
      High Traffic Mode — reply volume is elevated right now, so quick questions (stock/price) are answered ahead of longer conversations.
    </div>
  );
}
