"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Files,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Percent,
  Plug,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  Users,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@acme/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@acme/ui/sheet";
import { ThemeToggle } from "@acme/ui/theme";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@acme/ui/tooltip";
import { cn } from "@acme/ui";

import { signOut } from "../actions";
import { playChime } from "~/lib/sound";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface SubItem {
  href: string;
  label: string;
  icon?: React.ElementType;
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  /** Optional nested links rendered in a Collapsible under the row. */
  submenu?: SubItem[];
}

interface NavGroup {
  /** Group heading shown above the items (only when expanded). */
  title: string;
  items: NavItem[];
}

/* ─── Nav definition ────────────────────────────────────────────────── */

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    title: "Apps",
    items: [
      { href: "/dashboard/inbox", icon: Inbox, label: "Inbox" },
      { href: "/dashboard/files", icon: Files, label: "Files" },
    ],
  },
  {
    title: "eCommerce",
    items: [
      { href: "/dashboard/ecommerce", icon: Store, label: "Storefront" },
    ],
  },
  {
    title: "SaaS",
    items: [
      { href: "/dashboard/saas", icon: Sparkles, label: "SaaS Dashboard" },
      { href: "/dashboard/pricing", icon: Tags, label: "Pricing" },
      { href: "/dashboard/billing", icon: CreditCard, label: "Billing" },
    ],
  },
  {
    title: "Management",
    items: [
      { href: "/dashboard/orders", icon: Package, label: "Orders" },
      { href: "/dashboard/products", icon: ShoppingBag, label: "Products" },
      { href: "/dashboard/customers", icon: Users, label: "Customers" },
      { href: "/dashboard/invoices", icon: Receipt, label: "Invoices" },
      { href: "/dashboard/offers", icon: Percent, label: "Offers" },
    ],
  },
  {
    title: "AI",
    items: [
      { href: "/dashboard/integrations", icon: Plug, label: "Integrations" },
      { href: "/dashboard/ai", icon: MessageCircle, label: "AI Agent" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings", icon: Settings, label: "Settings" },
      { href: "/dashboard/notifications", icon: Bell, label: "Notifications" },
    ],
  },
];

/* ─── Helpers ───────────────────────────────────────────────────────── */

const normalize = (v: string | null) => {
  if (!v) return "";
  if (v === "/") return "/";
  return v.replace(/\/$/, "");
};

function isItemActive(pathname: string, item: NavItem): boolean {
  const np = normalize(pathname);
  const nh = normalize(item.href);
  if (nh === "/dashboard") return np === "/dashboard";
  if (np === nh) return true;
  if (item.submenu?.length) return np.startsWith(`${nh}/`);
  return false;
}

function isSubActive(pathname: string | null, sub: SubItem): boolean {
  const np = normalize(pathname);
  const nh = normalize(sub.href);
  return np === nh || np.startsWith(`${nh}/`);
}

function getActiveItem(pathname: string): NavItem | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isItemActive(pathname, item)) return item;
    }
  }
  return null;
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

/* ─── Inbox unread stream ───────────────────────────────────────────── */

function useInboxStream() {
  const [unreadCount, setUnreadCount] = useState(0);
  const latestEventIdRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const eventSource = new EventSource("/api/inbox/stream");
    eventSource.onmessage = (event: MessageEvent<string>) => {
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

/* ─── Active indicator bar ──────────────────────────────────────────── */

function ActiveBar({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
        active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
      )}
    />
  );
}

/* ─── Tinted icon container ────────────────────────────────────────── */

function ItemIcon({
  Icon,
  active,
  size = "md",
}: {
  Icon: React.ElementType;
  active: boolean;
  size?: "md" | "sm";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg transition-all duration-150",
        size === "md" ? "h-7 w-7" : "h-4 w-4",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground group-hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}

/* ─── Unread badge ──────────────────────────────────────────────────── */

function UnreadBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-md px-1.5",
        "text-[10px] font-bold tabular-nums leading-none",
        "bg-primary text-primary-foreground",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* ─── (no header — logo removed) ────────────────────────────────────── */

/* ─── Group title (with horizontal rule) ────────────────────────────── */

function GroupTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
      <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/60">
        {title}
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

/* ─── Nav row (link or collapsible-with-submenu) ────────────────────── */

function NavRow({
  item,
  pathname,
  isCollapsed,
  openMenus,
  setOpenMenus,
  unreadCount,
}: {
  item: NavItem;
  pathname: string;
  isCollapsed: boolean;
  openMenus: Record<string, boolean>;
  setOpenMenus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  unreadCount: number;
}) {
  const isActive = isItemActive(pathname, item);
  const submenu = item.submenu ?? [];
  const hasSubmenu = submenu.length > 0;
  const isSubmenuActive = submenu.some((s) => isSubActive(pathname, s));
  const isOpen = openMenus[item.label] ?? (isActive || isSubmenuActive);
  const Icon = item.icon;
  const showInboxBadge = item.href === "/dashboard/inbox" && unreadCount > 0;

  const rowBase =
    "group relative flex h-auto w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200 cursor-pointer";
  const rowInactive =
    "text-muted-foreground hover:bg-muted/60 hover:text-foreground";
  const rowActive = "bg-primary/10 font-bold text-primary shadow-sm";

  /* ── Collapsed sidebar ── */
  if (isCollapsed) {
    const iconBtn = (
      <button
        className={cn(
          "group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
          isActive
            ? "bg-primary/10 shadow-sm"
            : "hover:bg-muted/60 text-muted-foreground",
        )}
        aria-label={item.label}
      >
        <ActiveBar active={isActive} />
        <ItemIcon Icon={Icon} active={isActive} />
      </button>
    );

    if (hasSubmenu) {
      return (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{iconBtn}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={14}>
              {item.label}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={14}
            className="min-w-[192px] rounded-xl border-border/60 bg-card p-1.5 shadow-xl"
          >
            <DropdownMenuItem asChild className="rounded-lg focus:bg-muted">
              <Link
                href={item.href}
                className="flex items-center gap-2.5 px-2 py-2"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13px] font-medium">{item.label}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 bg-border/50" />
            {submenu.map((sub) => {
              const SubIcon = sub.icon;
              return (
                <DropdownMenuItem
                  key={sub.href}
                  asChild
                  className="rounded-lg focus:bg-muted"
                >
                  <Link
                    href={sub.href}
                    className="flex items-center gap-2.5 px-2 py-2"
                  >
                    {SubIcon ? (
                      <SubIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                    <span className="text-[13px]">{sub.label}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={item.href}>{iconBtn}</Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={14}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  /* ── Expanded: no submenu ── */
  if (!hasSubmenu) {
    return (
      <Link
        href={item.href}
        className={cn(rowBase, isActive ? rowActive : rowInactive)}
      >
        <ActiveBar active={isActive} />
        <ItemIcon Icon={Icon} active={isActive} />
        <span className="flex-1 truncate pl-1">{item.label}</span>
        {showInboxBadge ? <UnreadBadge count={unreadCount} /> : null}
      </Link>
    );
  }

  /* ── Expanded: with submenu (Collapsible) ── */
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(open: boolean) =>
        setOpenMenus((prev) => ({ ...prev, [item.label]: open }))
      }
    >
      <div
        className={cn(
          "group relative flex w-full items-stretch overflow-hidden rounded-xl transition-all duration-200",
          isActive ? rowActive : rowInactive,
        )}
      >
        <Link
          href={item.href}
          className={cn(
            rowBase,
            "flex-1 rounded-none bg-transparent hover:bg-transparent",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ActiveBar active={isActive} />
          <ItemIcon Icon={Icon} active={isActive} />
          <span className="flex-1 truncate pl-1">{item.label}</span>
        </Link>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex h-auto w-9 shrink-0 items-center justify-center self-stretch rounded-none bg-transparent transition-all duration-200",
              "hover:bg-black/5 dark:hover:bg-white/5",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
            aria-label={`Toggle ${item.label} submenu`}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="pt-1.5">
        <div className="relative ml-5 space-y-0.5 pb-1 pl-3.5">
          {submenu.map((sub) => {
            const SubIcon = sub.icon;
            const subActive = isSubActive(pathname, sub);
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={cn(
                  "relative flex h-[30px] items-center gap-2 rounded-lg px-2 text-[12.5px] transition-all duration-150",
                  subActive
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {SubIcon ? (
                  <SubIcon className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span
                    className={cn(
                      "h-[5px] w-[5px] shrink-0 rounded-full",
                      subActive ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
                <span className="flex-1">{sub.label}</span>
                {subActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─── Footer (sign out + theme + live status) ───────────────────────── */

function SidebarFooter({ isCollapsed }: { isCollapsed: boolean }) {
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 pb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <form action={signOut}>
              <Button
                variant="ghost"
                size="icon"
                type="submit"
                aria-label="Log out"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </Button>
            </form>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={14}>
            Log out
          </TooltipContent>
        </Tooltip>
        <ThemeToggle />
      </div>
    );
  }

  return (
    <div className="w-full shrink-0 space-y-2 px-2 pb-3 pt-2">
      <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-semibold text-foreground">
            SellPilot
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground/60">
            v{APP_VERSION}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live
        </div>
      </div>
      <div className="flex items-center gap-2">
        <form action={signOut} className="flex-1">
          <Button
            variant="ghost"
            type="submit"
            className="w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </Button>
        </form>
        <ThemeToggle />
      </div>
    </div>
  );
}

/* ─── Shared data hook ──────────────────────────────────────────────── */

function useSidebarData() {
  const pathname = usePathname();
  const active = getActiveItem(pathname);
  const unreadCount = useInboxStream();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title =
      unreadCount > 0 ? `(${unreadCount}) SellPilot` : "SellPilot";
  }, [unreadCount]);

  return { pathname, active, unreadCount };
}

const APP_VERSION = "1.0.0";

const BRAND = { name: "SellPilot", plan: "Pro", active: true, role: "Admin" };
void BRAND; // kept for future brand metadata; header is logo-only for now

/* ─── Desktop sidebar ──────────────────────────────────────────────── */

function SidebarBody({ isCollapsed }: { isCollapsed: boolean }) {
  const { pathname, active: _active, unreadCount } = useSidebarData();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        isCollapsed ? "px-2" : "px-3",
      )}
    >
      {/* Nav */}
      <nav
        className={cn(
          "scrollbar-none min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
          isCollapsed ? "px-0 py-2" : "px-0 py-1",
        )}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-1">
            {!isCollapsed && <GroupTitle title={group.title} />}
            {isCollapsed && (
              <div className="mx-3 my-2 h-px bg-border/40" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  isCollapsed={isCollapsed}
                  openMenus={openMenus}
                  setOpenMenus={setOpenMenus}
                  unreadCount={unreadCount}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <SidebarFooter isCollapsed={isCollapsed} />
    </div>
  );
}

/* ─── Mobile sheet (pinned header, scrollable nav, pinned footer) ──── */

function MobileSidebarSheet() {
  const { pathname, unreadCount } = useSidebarData();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  return (
    <div className="flex h-full flex-col px-3 py-5">
      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-1">
            <GroupTitle title={group.title} />
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  isCollapsed={false}
                  openMenus={openMenus}
                  setOpenMenus={setOpenMenus}
                  unreadCount={unreadCount}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <SidebarFooter isCollapsed={false} />
    </div>
  );
}

/* ─── Mobile hamburger + sheet ─────────────────────────────────────── */

function MobileMenu() {
  const mounted = useIsClient();
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
      <SheetContent
        side="top"
        className="rounded-b-[28px] p-0"
        title="SellPilot navigation"
      >
        <MobileSidebarSheet />
      </SheetContent>
    </Sheet>
  );
}

/* ─── Public Sidebar ────────────────────────────────────────────────── */

const STORAGE_KEY = "sellpilot-sidebar-collapsed";

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function usePersistedCollapsed(): readonly [boolean, (next: boolean) => void] {
  // useSyncExternalStore handles hydration without useEffect setState
  // (server snapshot is false; client snapshot reads from localStorage;
  // subscribe listens for cross-tab storage events).
  const collapsed = useSyncExternalStore<boolean>(
    (onChange) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => readStoredCollapsed(),
    () => false,
  );

  const setCollapsed = (next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      // Manually fire a storage event so other mounted Sidebar instances
      // (and any future external store listeners) re-read the value.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: next ? "1" : "0",
        }),
      );
    } catch {
      /* ignore */
    }
  };

  return [collapsed, setCollapsed] as const;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = usePersistedCollapsed();

  const handleCollapse = () => setCollapsed(true);
  const handleExpand = () => setCollapsed(false);

  return (
    <>
      <aside
        className={cn(
          "relative hidden h-full shrink-0 p-3 transition-[width] duration-300 md:block",
          collapsed ? "w-[78px]" : "w-[268px]",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[28px] border bg-card shadow-lg">
          <SidebarBody isCollapsed={collapsed} />
        </div>

        {/* Collapse / expand toggle — rendered as a sibling so it isn't
            clipped by the rounded card's overflow-hidden. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={collapsed ? handleExpand : handleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="absolute top-12 -right-3 z-50 hidden h-6 w-6 rounded-full border border-border bg-background text-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:bg-muted md:inline-flex"
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={14}>
            {collapsed ? "Expand" : "Collapse"}
          </TooltipContent>
        </Tooltip>
      </aside>

      <div className="fixed left-4 right-4 top-4 z-40 flex h-16 w-full items-center justify-between rounded-[24px] border bg-card px-4 shadow-lg md:hidden">
        <MobileMenu />
      </div>
    </>
  );
}
