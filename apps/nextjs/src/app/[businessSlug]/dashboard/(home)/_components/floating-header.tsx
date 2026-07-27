"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, LogOut, Store, User as UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { ThemeToggle } from "@acme/ui/theme";
import { cn } from "@acme/ui";

import { signOut } from "../actions";
import { useBusinessSlug } from "~/hooks/use-business-slug";
import { useTRPC } from "~/trpc/react";
import { NOTIFICATION_TYPE_ICON, formatNotificationTime } from "~/lib/notification-utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const capitalize = (s: string) => {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ─── Header notification bell + dropdown ────────────────────────────
 * Polls rather than opens its own SSE connection — the sidebar's bell already
 * holds a live connection for instant toast/chime; a second one here would just
 * double up those side effects for the same event. This stays "eventually
 * fresh" (15s) without that duplication. */
function NotificationBell() {
  const trpc = useTRPC();
  const businessSlug = useBusinessSlug();

  const { data: notifications } = useQuery({
    ...trpc.notifications.list.queryOptions({ limit: 10 }),
    refetchInterval: 15_000,
  });
  const { data: unread } = useQuery({
    ...trpc.notifications.getUnreadCount.queryOptions(),
    refetchInterval: 15_000,
  });
  const markRead = useMutation(trpc.notifications.markRead.mutationOptions());

  const unreadCount = unread?.count ?? 0;
  const items = notifications ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-haze-sidebar-active-bg/30 hover:text-foreground transition-all duration-200"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-1 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-lg border-haze-divider bg-card p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && <span className="text-xs text-muted-foreground">{unreadCount} unread</span>}
        </div>
        <DropdownMenuSeparator className="m-0 bg-haze-divider/40" />

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">No notifications yet</p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {items.map((n) => {
              const Icon = NOTIFICATION_TYPE_ICON[n.type] ?? Bell;
              const body = (
                <div className={cn("flex items-start gap-2.5 px-3 py-2.5", !n.read && "bg-primary/[0.04]")}>
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-xs", n.read ? "font-medium" : "font-semibold")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">{formatNotificationTime(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                </div>
              );

              return (
                <DropdownMenuItem
                  key={n.id}
                  asChild
                  className="cursor-pointer rounded-none p-0 focus:bg-muted"
                  onSelect={() => {
                    if (!n.read) markRead.mutate({ id: n.id });
                  }}
                >
                  {n.link ? <Link href={`/${businessSlug}${n.link}`}>{body}</Link> : <div>{body}</div>}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}

        <DropdownMenuSeparator className="m-0 bg-haze-divider/40" />
        <DropdownMenuItem asChild className="justify-center rounded-none py-2.5 text-xs font-medium text-primary focus:bg-muted">
          <Link href={`/${businessSlug}/dashboard/notifications`}>View all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FloatingHeader({
  user,
}: {
  user: { name: string; email: string; image: string | null } | null;
}) {
  const pathname = usePathname();
  const businessSlug = useBusinessSlug();
  const segments = pathname.split("/").filter(Boolean);

  // Generate breadcrumbs: e.g. /{slug}/dashboard/analytics -> Dashboard / Analytics
  // (the leading store-slug segment is part of every href but not shown as its own crumb)
  const breadcrumbs = segments
    .map((seg, idx) => {
      const href = "/" + segments.slice(0, idx + 1).join("/");
      const label = capitalize(seg === "dashboard" ? "Dashboard" : seg);
      const isLast = idx === segments.length - 1;
      return { href, label, isLast, idx };
    })
    .filter((c) => c.idx !== 0);

  return (
    <header className="glass-overlay sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-haze-divider/40 px-6 hidden md:flex shrink-0 print:hidden">
      {/* Left side: Breadcrumbs */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-xs font-medium tracking-tight">
          {breadcrumbs.length === 0 ? (
            <li className="text-foreground font-semibold">Dashboard</li>
          ) : (
            breadcrumbs.map((crumb, idx) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {idx > 0 && <span className="text-muted-foreground/40 font-normal">/</span>}
                {crumb.isLast ? (
                  <span className="text-foreground font-semibold select-none">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            ))
          )}
        </ol>
      </nav>

      {/* Right side: Action items */}
      <div className="flex items-center gap-3">
        <NotificationBell />

        <ThemeToggle />

        <div className="h-4 w-px bg-haze-divider/60" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-haze-divider/40 bg-card/45 px-2.5 py-1 text-sm font-medium hover:bg-muted/50 hover:text-foreground transition-all duration-200"
            >
              <div className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary ring-1 ring-haze-divider">
                {user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="h-full w-full rounded-full object-cover" />
                ) : user ? (
                  initials(user.name)
                ) : (
                  <UserIcon className="h-3 w-3" />
                )}
              </div>
              <span className="hidden text-xs font-semibold md:block text-muted-foreground group-hover:text-foreground transition-colors">
                {user?.name.split(" ")[0] ?? "Alex"}
              </span>
              <ChevronDown className="hidden size-3 text-muted-foreground/60 md:block group-hover:text-foreground transition-colors" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-lg border-haze-divider bg-card">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-semibold text-foreground">{user?.name ?? "Account"}</p>
              {user?.email && <p className="truncate text-xs text-muted-foreground/80">{user.email}</p>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-haze-divider/40" />
            <DropdownMenuItem asChild className="rounded-md focus:bg-muted">
              <Link href={`/${businessSlug}/dashboard/settings`}>Profile settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-md focus:bg-muted">
              <Link href="/onboarding/select-business">
                <Store className="h-4 w-4" />
                Switch store
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-haze-divider/40" />
            <DropdownMenuItem variant="destructive" onSelect={() => void signOut()} className="rounded-md">
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
