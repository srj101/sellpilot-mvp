"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { useBusinessSlug } from "~/hooks/use-business-slug";
import { NOTIFICATION_TYPE_ICON, formatNotificationTime } from "~/lib/notification-utils";

interface Notification {
  id: string;
  businessId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export function NotificationsClient() {
  const trpc = useTRPC();
  const businessSlug = useBusinessSlug();

  const { data: notifications, isPending } = useQuery({
    ...trpc.notifications.list.queryOptions({ limit: 50 }),
    // Lightweight polling while this page is open — the sidebar bell already gets
    // instant updates over the live SSE stream, this just keeps the list itself
    // reasonably fresh without opening a second SSE connection (which would double
    // up the bell's toast/chime for the same event).
    refetchInterval: 15_000,
  });

  const markRead = useMutation(trpc.notifications.markRead.mutationOptions());
  const markAllRead = useMutation(trpc.notifications.markAllRead.mutationOptions());

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  function handleOpen(n: Notification) {
    if (!n.read) markRead.mutate({ id: n.id });
  }

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
        </p>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => markAllRead.mutate(undefined)}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {(notifications ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-card py-16 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No notifications yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            New orders, payments, and follow-ups will show up here.
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {(notifications ?? []).map((n) => {
            const Icon = NOTIFICATION_TYPE_ICON[n.type] ?? Bell;
            const content = (
              <div
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40",
                  !n.read && "bg-primary/[0.03]",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-sm", n.read ? "font-medium" : "font-semibold")}>{n.title}</p>
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{formatNotificationTime(n.createdAt)}</p>
                </div>
              </div>
            );

            return n.link ? (
              <Link key={n.id} href={`/${businessSlug}${n.link}`} onClick={() => handleOpen(n)} className="block">
                {content}
              </Link>
            ) : (
              <button key={n.id} type="button" onClick={() => handleOpen(n)} className="block w-full text-left">
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
