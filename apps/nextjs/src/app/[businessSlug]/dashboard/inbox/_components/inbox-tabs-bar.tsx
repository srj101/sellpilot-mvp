"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, CheckCircle2, Filter, Inbox, MessageCircle, MoreHorizontal, Tag, X } from "lucide-react";

import type { InboxThread } from "@acme/api/meta-inbox";
import { Button } from "@acme/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@acme/ui/sheet";
import { cn } from "@acme/ui";

import { CHANNELS } from "./inbox-utils";
import { useBusinessSlug } from "~/hooks/use-business-slug";

function isUnreplied(thread: InboxThread) {
  return thread.messages[thread.messages.length - 1]?.direction === "inbound";
}

function hrefWith(businessSlug: string, current: URLSearchParams, patch: Record<string, string>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === "all") params.delete(key);
    else params.set(key, value);
  }
  params.delete("thread");
  const qs = params.toString();
  const base = `/${businessSlug}/dashboard/inbox`;
  return qs ? `${base}?${qs}` : base;
}

const STATUS_ITEMS = [
  { id: "all", label: "All Contacts", icon: Inbox },
  { id: "unreplied", label: "Needs Reply", icon: MessageCircle },
  { id: "order_requests", label: "Order Requests", icon: Tag },
  { id: "ticket", label: "Tickets", icon: Tag },
  { id: "resolved", label: "Resolved", icon: CheckCircle2 },
  { id: "archived", label: "Archived", icon: Archive },
] as const;

export function InboxFilterSheet({ children }: { children: React.ReactNode }) {
  const businessSlug = useBusinessSlug();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get("status") ?? "all";
  const activeChannel = searchParams.get("channel") ?? "all";

  const hasActiveFilters = activeStatus !== "all" || activeChannel !== "all";

  return (
    <Sheet>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-5">
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Show</h3>
            <div className="space-y-1">
              {STATUS_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeStatus === item.id;
                return (
                  <Link key={item.id} href={hrefWith(businessSlug, searchParams, { status: item.id })}>
                    <div className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                    )}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channel</h3>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <Link key={c.id} href={hrefWith(businessSlug, searchParams, { channel: c.id })}>
                  <Button
                    type="button"
                    variant={activeChannel === c.id ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-full text-xs"
                  >
                    {c.id === "all" ? "All channels" : c.label}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
          {hasActiveFilters && (
            <Link href={`/${businessSlug}/dashboard/inbox`}>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-full gap-1.5 text-xs text-muted-foreground">
                <X className="h-3.5 w-3.5" />
                Clear all filters
              </Button>
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function InboxTabsBar({ threads }: { threads: InboxThread[] }) {
  const businessSlug = useBusinessSlug();
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
    <div className="flex shrink-0 items-center justify-between border-b bg-card px-3 py-2 md:px-4 md:py-2.5">
      {/* Desktop: full status tabs */}
      <div className="hidden flex-wrap items-center gap-1 md:flex">
        {STATUS_ITEMS.map((tab, i) => {
          const Icon = tab.icon;
          return (
            <div key={tab.id} className="flex items-center">
              {i > 0 && <span className="mx-1 h-4 w-px bg-border" />}
              <Link href={hrefWith(businessSlug, searchParams, { status: tab.id })}>
                <Button
                  type="button"
                  variant={activeStatus === tab.id ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("h-8 gap-1.5 rounded-lg px-2.5 text-xs", activeStatus === tab.id && "font-semibold")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  <span className="rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-bold text-primary">{counts[tab.id]}</span>
                </Button>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Desktop: channel filter */}
      <div className="hidden items-center gap-1 rounded-lg border bg-background/50 p-1 md:flex ml-auto">
        {CHANNELS.map((c) => (
          <Link key={c.id} href={hrefWith(businessSlug, searchParams, { channel: c.id })}>
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
