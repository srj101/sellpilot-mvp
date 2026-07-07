"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@acme/ui/sheet";
import { cn } from "@acme/ui";

import { signOut } from "../actions";
import { playChime } from "~/lib/sound";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/inbox", icon: Inbox, label: "Inbox" },
  { href: "/dashboard/products", icon: ShoppingBag, label: "Products" },
  { href: "/dashboard/orders", icon: Package, label: "Orders" },
  { href: "/dashboard/payments", icon: CreditCard, label: "Payments" },
  { href: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/dashboard/integrations", icon: Link2, label: "Integrations" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

function getActiveIndex(pathname: string): number {
  const exactIndex = NAV_ITEMS.findIndex((item) => item.href === pathname);
  if (exactIndex !== -1) return exactIndex;

  return NAV_ITEMS.findIndex(
    (item) => pathname.startsWith(`${item.href}/`) && item.href !== "/dashboard",
  );
}

/* ------------------------------------------------------------------ */
/*  Polling hook – stable interval, no cascading re-renders           */
/* ------------------------------------------------------------------ */
function useInboxStream() {
  const [unreadCount, setUnreadCount] = useState(0);
  const latestEventIdRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const eventSource = new EventSource("/api/inbox/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          unreadCount: number;
          latestEventId: string | null;
        };

        setUnreadCount(data.unreadCount);

        if (
          data.latestEventId &&
          data.latestEventId !== latestEventIdRef.current
        ) {
          if (latestEventIdRef.current !== null) {
            playChime();
            if (window.location.pathname === "/dashboard/inbox") {
              router.refresh();
            }
          }
          latestEventIdRef.current = data.latestEventId;
        } else if (data.latestEventId === null) {
          latestEventIdRef.current = null;
        }
      } catch (err) {
        console.error("Failed to parse SSE payload:", err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [router]);

  return unreadCount;
}

/* ------------------------------------------------------------------ */
/*  Sidebar content                                                    */
/* ------------------------------------------------------------------ */
function SidebarContent() {
  const pathname = usePathname();
  const activeIndex = getActiveIndex(pathname);
  const unreadCount = useInboxStream();

  // Sync document title
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title =
      unreadCount > 0 ? `(${unreadCount}) SellPilot` : "SellPilot";
  }, [unreadCount]);

  return (
    <div className="flex h-full flex-col overflow-hidden px-5 py-7">
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="mb-7 flex items-center gap-2.5 px-3">
        <span className="relative flex h-[26px] w-[26px] items-center justify-center">
          <span className="absolute inset-0 rounded-lg bg-primary/15" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <span className="text-[17px] font-bold tracking-tight text-foreground">
          SellPilot
        </span>
      </div>

      {/* ── Label ────────────────────────────────────────────── */}
      <div className="mb-2 px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
          Menu
        </span>
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeIndex === index;
          const isInbox = item.label === "Inbox";
          const showBadge = isInbox && unreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/[0.08] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Active pill indicator */}
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
                  isActive
                    ? "scale-y-100 opacity-100"
                    : "scale-y-0 opacity-0 group-hover:scale-y-75 group-hover:opacity-40",
                )}
              />

              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground/70",
                )}
              />

              <span className="flex-1 truncate">{item.label}</span>

              {/* Unread badge */}
              {showBadge && (
                <span
                  className={cn(
                    "flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-md px-1.5",
                    "text-[10px] font-bold tabular-nums leading-none",
                    "bg-primary text-primary-foreground",
                    "shadow-[0_0_8px_rgba(var(--primary-rgb,99,102,241),0.35)]",
                  )}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="mt-4 border-t border-border/40 pt-4">
        <form action={signOut}>
          <Button
            variant="ghost"
            type="submit"
            className="w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar shell                                                      */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 p-4 pr-0 md:block">
        <div className="flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[28px] border bg-card shadow-lg">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed left-4 right-4 top-4 z-40 flex h-16 items-center justify-between rounded-[24px] border bg-card px-4 shadow-lg md:hidden">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary h-3 w-3 rounded-full" />
          <span className="text-lg font-bold text-foreground">SellPilot</span>
        </div>
        <MobileMenu />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile menu                                                        */
/* ------------------------------------------------------------------ */
function MobileMenu() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="top" className="rounded-b-[28px] px-0 py-0">
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );
}
