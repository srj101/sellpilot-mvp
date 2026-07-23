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
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Plug,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Tags,
  Users,
  ShoppingCart,
  LifeBuoy,
  User,
  Shield,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@acme/ui/tooltip";
import { cn } from "@acme/ui";

import { signOut } from "../actions";
import { playChime } from "~/lib/sound";
import { useStoreSlug } from "~/hooks/use-store-slug";
import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

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
      { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
      { href: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
      { href: "/dashboard/ecommerce", icon: ShoppingCart, label: "eCommerce" },
    ],
  },
  {
    title: "Apps",
    items: [
      { href: "/dashboard/inbox", icon: Inbox, label: "Inbox" },
      { href: "/dashboard/support", icon: LifeBuoy, label: "Support" },
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
      { href: "/dashboard/users", icon: User, label: "Users" },
      { href: "/dashboard/roles", icon: Shield, label: "Roles" },
    ],
  },
  {
    title: "AI",
    items: [
      { href: "/dashboard/integrations", icon: Plug, label: "Integrations" },
    ],
  },
  {
    title: "Account",
    items: [
      {
        href: "/dashboard/settings",
        icon: Settings,
        label: "Settings",
        submenu: [
          { href: "/dashboard/settings/profile", label: "Profile" },
          { href: "/dashboard/settings/password", label: "Password" },
          { href: "/dashboard/settings/configurations", label: "Configurations" },
        ],
      },
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
  const storeSlug = useStoreSlug();

  useEffect(() => {
    const eventSource = new EventSource(`/api/inbox/stream?storeSlug=${encodeURIComponent(storeSlug)}`);
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
            if (window.location.pathname.endsWith("/dashboard/inbox")) {
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
  }, [router, storeSlug]);

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
    <div className="px-3 pt-3 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        {title}
      </span>
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
  storeSlug,
}: {
  item: NavItem;
  pathname: string;
  isCollapsed: boolean;
  openMenus: Record<string, boolean>;
  setOpenMenus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  unreadCount: number;
  storeSlug: string;
}) {
  const isActive = isItemActive(pathname, item);
  const submenu = item.submenu ?? [];
  const hasSubmenu = submenu.length > 0;
  const isSubmenuActive = submenu.some((s) => isSubActive(pathname, s));
  const isOpen = openMenus[item.label] ?? (isActive || isSubmenuActive);
  const Icon = item.icon;
  const showInboxBadge = item.href === "/dashboard/inbox" && unreadCount > 0;
  const withSlug = (href: string) => `/${storeSlug}${href}`;

  const rowBase =
    "group relative flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 cursor-pointer";
  const rowInactive =
    "text-haze-sidebar-text hover:bg-haze-sidebar-active-bg/30 hover:text-haze-sidebar-text-active";
  const rowActive = "bg-haze-sidebar-active-bg font-semibold text-haze-sidebar-text-active shadow-xs";

  /* ── Collapsed sidebar ── */
  if (isCollapsed) {
    const iconBtn = (
      <button
        className={cn(
          "group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
          isActive
            ? "bg-haze-sidebar-active-bg text-haze-sidebar-text-active shadow-xs"
            : "hover:bg-haze-sidebar-active-bg/30 text-haze-sidebar-text",
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
            className="min-w-[192px] rounded-lg border-haze-divider bg-card p-1.5 shadow-xl"
          >
            <DropdownMenuItem asChild className="rounded-lg focus:bg-muted">
              <Link
                href={withSlug(item.href)}
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
                    href={withSlug(sub.href)}
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
          <Link href={withSlug(item.href)}>{iconBtn}</Link>
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
        href={withSlug(item.href)}
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
          "group relative flex w-full items-stretch overflow-hidden rounded-lg transition-all duration-200",
          isActive ? rowActive : rowInactive,
        )}
      >
        <Link
          href={withSlug(item.href)}
          className={cn(
            rowBase,
            "flex-1 rounded-none bg-transparent hover:bg-transparent",
            isActive ? "text-haze-sidebar-text-active" : "text-haze-sidebar-text",
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
                href={withSlug(sub.href)}
                className={cn(
                  "relative flex h-[30px] items-center gap-2 rounded-lg px-2 text-[12.5px] transition-all duration-150",
                  subActive
                    ? "font-semibold text-haze-sidebar-text-active bg-haze-sidebar-active-bg/20"
                    : "text-haze-sidebar-text hover:bg-haze-sidebar-active-bg/10 hover:text-haze-sidebar-text-active",
                )}
              >
                {SubIcon ? (
                  <SubIcon className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span
                    className={cn(
                      "h-[5px] w-[5px] shrink-0 rounded-full",
                      subActive ? "bg-haze-primary" : "bg-haze-divider",
                    )}
                  />
                )}
                <span className="flex-1">{sub.label}</span>
                {subActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-haze-primary" />
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
      </div>
    );
  }

  return (
    <div className="w-full shrink-0 space-y-2 px-1 pb-4 pt-2">
      <form action={signOut}>
        <Button variant="ghost" type="submit" className="w-full justify-start gap-2.5 rounded-lg px-3 text-[13px] font-medium text-rose-500 hover:bg-rose-500/10 hover:text-rose-500 transition-colors">
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span>Log out</span>}
        </Button>
      </form>
    </div>
  );
}

/* ─── Shared data hook ──────────────────────────────────────────────── */

function useSidebarData() {
  const rawPathname = usePathname();
  const storeSlug = useStoreSlug();
  // NAV_GROUPS hrefs are unscoped ("/dashboard/x") by design — strip the leading
  // /{storeSlug} segment so active-item matching keeps working unchanged.
  const slugPrefix = `/${storeSlug}`;
  const pathname = rawPathname.startsWith(slugPrefix) ? rawPathname.slice(slugPrefix.length) || "/" : rawPathname;
  const active = getActiveItem(pathname);
  const unreadCount = useInboxStream();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title =
      unreadCount > 0 ? `(${unreadCount}) SellPilot` : "SellPilot";
  }, [unreadCount]);

  return { pathname, active, unreadCount, storeSlug };
}

/* ─── Active store name (shown under the logo, links to the store switcher) ──── */

function useActiveStoreName() {
  const trpc = useTRPC();
  const storesQuery = useQuery(trpc.org.listMine.queryOptions());
  return storesQuery.data?.find((s) => s.isActive)?.name ?? null;
}

function SidebarLogoHeader({ isCollapsed }: { isCollapsed: boolean }) {
  const storeName = useActiveStoreName();

  return (
    <Link
      href="/onboarding/select-store"
      className={cn(
        "flex h-16 items-center gap-3 border-b border-haze-divider/40 mb-3 shrink-0 transition-colors hover:bg-haze-sidebar-active-bg/20",
        isCollapsed ? "justify-center px-1" : "px-4",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg gradient-accent text-sm font-bold text-white shadow-sm shadow-primary/20">
        S
      </div>
      {!isCollapsed && (
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold tracking-tight text-foreground">
            SellPilot
          </span>
          {storeName && (
            <span className="block truncate text-[11px] font-medium text-muted-foreground">
              {storeName}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

/* ─── Desktop sidebar ──────────────────────────────────────────────── */

function SidebarBody({ isCollapsed }: { isCollapsed: boolean }) {
  const { pathname, active: _active, unreadCount, storeSlug } = useSidebarData();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const session = authClient.useSession();
  const role = session.data?.user?.role ?? "client";

  const isPlatformAdmin = role === "admin" || role === "super_admin";
  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if ((item.label === "SaaS Dashboard" || item.label === "Users") && !isPlatformAdmin) {
        return false;
      }
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        isCollapsed ? "px-1" : "px-2",
      )}
    >
      <SidebarLogoHeader isCollapsed={isCollapsed} />

      {/* Nav */}
      <nav
        className={cn(
          "haze-scrollbar-dark min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
          isCollapsed ? "px-0 py-2" : "px-0 py-1",
        )}
      >
        {filteredGroups.map((group) => (
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
                  storeSlug={storeSlug}
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
  const { pathname, unreadCount, storeSlug } = useSidebarData();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const session = authClient.useSession();
  const role = session.data?.user?.role ?? "client";

  const isPlatformAdmin = role === "admin" || role === "super_admin";
  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if ((item.label === "SaaS Dashboard" || item.label === "Users") && !isPlatformAdmin) {
        return false;
      }
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col px-3 py-5">

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">
        {filteredGroups.map((group) => (
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
                  storeSlug={storeSlug}
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
          "relative hidden h-full shrink-0 transition-[width] duration-300 md:flex flex-col border-r border-haze-divider bg-haze-sidebar-bg text-haze-sidebar-text",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <SidebarBody isCollapsed={collapsed} />
        </div>

        {/* Collapse / expand toggle */}
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

      <div className="fixed left-4 right-4 top-4 z-40 flex h-14 w-full items-center justify-between rounded-xl border border-haze-divider bg-card/75 px-4 shadow-md backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="select-none text-sm font-bold tracking-tight text-foreground">
            SellPilot AI
          </span>
        </div>
        <MobileMenu />
      </div>
    </>
  );
}
