"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import type { InboxThread } from "@acme/api/meta-inbox";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { cn } from "@acme/ui";

import { CHANNELS, avatarColor, channelIcon, formatRelativeTimeShort, initials, platformBadgeColor } from "./inbox-utils";

export function ConversationList({
  threads,
  selectedThreadId,
}: {
  threads: InboxThread[];
  selectedThreadId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["id"]>("all");

  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (channel !== "all" && t.platform !== channel) return false;
      if (search && !t.contactLabel.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [threads, search, channel]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="rounded-xl border bg-background/50 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant={channel === c.id ? "default" : "outline"}
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setChannel(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length > 0 ? (
          filtered.map((thread) => {
            const latestMessage = thread.messages[thread.messages.length - 1];
            const isUnread = latestMessage?.direction === "inbound" && !latestMessage.isRead;
            const unreadCount = thread.messages.filter((m) => m.direction === "inbound" && !m.isRead).length;
            const selected = thread.id === selectedThreadId;

            return (
              <Link
                key={thread.id}
                href={`/dashboard/inbox?thread=${encodeURIComponent(thread.id)}`}
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
                    <span className={cn("truncate text-sm text-foreground", isUnread ? "font-bold" : "font-medium")}>
                      {thread.contactLabel}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeTimeShort(thread.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className={cn("truncate text-xs", isUnread ? "font-medium text-foreground" : "text-muted-foreground")}>
                      {thread.preview}
                    </p>
                    {unreadCount > 0 && (
                      <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] text-white hover:bg-emerald-500">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
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
