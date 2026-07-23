"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { InboxThread } from "@acme/api/meta-inbox";
import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";

import { CHANNELS, STATUS_TABS } from "./inbox-utils";
import { useStoreSlug } from "~/hooks/use-store-slug";

function isUnreplied(thread: InboxThread) {
  return thread.messages[thread.messages.length - 1]?.direction === "inbound";
}

function hrefWith(storeSlug: string, current: URLSearchParams, patch: Record<string, string>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === "all") params.delete(key);
    else params.set(key, value);
  }
  params.delete("thread");
  const qs = params.toString();
  const base = `/${storeSlug}/dashboard/inbox`;
  return qs ? `${base}?${qs}` : base;
}

export function InboxTabsBar({ threads }: { threads: InboxThread[] }) {
  const storeSlug = useStoreSlug();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get("status") ?? "all";
  const activeChannel = searchParams.get("channel") ?? "all";

  const counts = useMemo(
    () => ({
      all: threads.length,
      order_requests: threads.filter((t) => t.hasOrderRequest).length,
      unreplied: threads.filter(isUnreplied).length,
      ticket: threads.filter((t) => t.status === "ticket").length,
      resolved: threads.filter((t) => t.status === "resolved").length,
      archived: threads.filter((t) => t.status === "archived").length,
    }),
    [threads],
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-1">
        {STATUS_TABS.map((tab, i) => (
          <div key={tab.id} className="flex items-center">
            {i > 0 && <span className="mx-1 h-4 w-px bg-border" />}
            <Link href={hrefWith(storeSlug, searchParams, { status: tab.id })}>
              <Button
                type="button"
                variant={activeStatus === tab.id ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-8 gap-1.5 rounded-lg px-2.5 text-xs", activeStatus === tab.id && "font-semibold")}
              >
                {tab.label}
                <span className="rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-bold text-primary">{counts[tab.id]}</span>
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-lg border bg-background/50 p-1">
        {CHANNELS.map((c) => (
          <Link key={c.id} href={hrefWith(storeSlug, searchParams, { channel: c.id })}>
            <Button
              type="button"
              variant={activeChannel === c.id ? "default" : "ghost"}
              size="sm"
              className="h-7 rounded-md px-2.5 text-xs"
            >
              {c.id === "all" ? "All channels" : c.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
