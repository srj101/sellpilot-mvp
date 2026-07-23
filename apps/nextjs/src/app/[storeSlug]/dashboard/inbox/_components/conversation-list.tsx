"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Sparkles, Star } from "lucide-react";

import type { InboxThread } from "@acme/api/meta-inbox";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { cn } from "@acme/ui";

import { avatarColor, channelIcon, formatRelativeTimeShort, initials, platformBadgeColor, TAG_COLOR_CLASSES } from "./inbox-utils";
import { useStoreSlug } from "~/hooks/use-store-slug";

export function ConversationList({
  threads,
  selectedThreadId,
}: {
  threads: InboxThread[];
  selectedThreadId: string | null;
}) {
  const storeSlug = useStoreSlug();
  const searchParams = useSearchParams();
  const statusTab = searchParams.get("status") ?? "all";
  const channel = searchParams.get("channel") ?? "all";
  const [search, setSearch] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);

  const isUnreplied = (t: InboxThread) => t.messages[t.messages.length - 1]?.direction === "inbound";

  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (statusTab === "order_requests" && !t.hasOrderRequest) return false;
      if (statusTab === "unreplied" && !isUnreplied(t)) return false;
      if (["ticket", "resolved", "archived"].includes(statusTab) && t.status !== statusTab) return false;
      if (channel !== "all" && t.platform !== channel) return false;
      if (starredOnly && !t.starred) return false;
      if (search && !t.contactLabel.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, search, starredOnly, statusTab, channel]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-4 pb-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="rounded-xl border bg-background/50 pl-9"
          />
        </div>
        <Button
          type="button"
          variant={starredOnly ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5 rounded-xl px-3 text-xs"
          onClick={() => setStarredOnly((v) => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length > 0 ? (
          filtered.map((thread) => {
            const latestMessage = thread.messages[thread.messages.length - 1];
            const isUnread = latestMessage?.direction === "inbound" && !latestMessage.isRead;
            const unreadCount = thread.messages.filter((m) => m.direction === "inbound" && !m.isRead).length;
            const selected = thread.id === selectedThreadId;
            const aiHandled = latestMessage?.direction === "outbound" && latestMessage.sentBy === "ai";

            return (
              <Link
                key={thread.id}
                href={`/${storeSlug}/dashboard/inbox?thread=${encodeURIComponent(thread.id)}`}
                className={cn(
                  "flex items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-accent/50",
                  selected && "bg-accent",
                )}
              >
                <div className="relative shrink-0">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white",
                      avatarColor(thread.contactLabel),
                    )}
                  >
                    {initials(thread.contactLabel)}
                  </span>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background p-0.5",
                      platformBadgeColor(thread.platform),
                    )}
                  >
                    {channelIcon(thread.platform, "h-full w-full")}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {thread.starred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                      <span className={cn("truncate text-sm text-foreground", isUnread ? "font-bold" : "font-medium")}>
                        {thread.contactLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeTimeShort(thread.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className={cn("flex min-w-0 items-center gap-1 truncate text-xs", isUnread ? "font-medium text-foreground" : "text-muted-foreground")}>
                      {aiHandled && <Sparkles className="h-3 w-3 shrink-0 text-violet-500" />}
                      <span className="truncate">{thread.preview}</span>
                    </p>
                    {unreadCount > 0 && (
                      <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] text-white hover:bg-emerald-500">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                  {thread.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {thread.tags.map((t) => (
                        <span
                          key={t.id}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                            TAG_COLOR_CLASSES[t.color] ?? TAG_COLOR_CLASSES.slate,
                          )}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No conversations match.</p>
        )}
      </div>
    </div>
  );
}
