"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bug,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@acme/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import { signOut } from "~/app/[businessSlug]/dashboard/(home)/actions";

export type SuperadminTab =
  | "overview"
  | "stores"
  | "ai"
  | "queues"
  | "channels"
  | "users"
  | "payments"
  | "bugs";

interface NavItem {
  id: SuperadminTab;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Platform Overview",
    items: [
      { id: "overview", label: "Dashboard", icon: LayoutDashboard },
      { id: "stores", label: "Stores Directory", icon: Store },
    ],
  },
  {
    title: "System & AI Ops",
    items: [
      { id: "ai", label: "AI Observability", icon: Sparkles },
      { id: "queues", label: "Queues & Workers", icon: Activity },
      { id: "channels", label: "Channel Health", icon: Radio },
    ],
  },
  {
    title: "Administration",
    items: [
      { id: "users", label: "Platform Users", icon: Users },
      { id: "payments", label: "Payment Gateways", icon: CreditCard },
      { id: "bugs", label: "Bug Reports", icon: Bug },
    ],
  },
];

const STORAGE_KEY = "sellpilot-superadmin-sidebar-collapsed";

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function usePersistedCollapsed(): readonly [boolean, (next: boolean) => void] {
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "SA";
}

function SidebarNavRow({
  item,
  active,
  isCollapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-all duration-150",
              active
                ? "bg-primary/15 text-primary font-semibold"
                : "text-muted-foreground hover:bg-haze-sidebar-active-bg/20 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "bg-primary absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full transition-opacity",
                active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
              )}
            />
            <Icon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={14}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-auto w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-all duration-150",
        active
          ? "bg-haze-sidebar-active-bg/30 text-haze-sidebar-text-active font-semibold shadow-xs"
          : "text-haze-sidebar-text hover:bg-haze-sidebar-active-bg/20 hover:text-haze-sidebar-text-active",
      )}
    >
      <span
        className={cn(
          "bg-primary absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
        )}
      />
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1 truncate">{item.label}</span>
      {active && (
        <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
      )}
    </button>
  );
}

export function SuperadminSidebar({
  activeTab,
  onSelectTab,
  user,
}: {
  activeTab: SuperadminTab;
  onSelectTab: (tab: SuperadminTab) => void;
  user?: { name: string; email: string; image?: string | null } | null;
}) {
  const [collapsed, setCollapsed] = usePersistedCollapsed();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "border-haze-divider bg-haze-sidebar-bg text-haze-sidebar-text relative hidden h-full shrink-0 flex-col border-r transition-[width] duration-300 md:flex print:hidden",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Logo Header */}
          <div
            className={cn(
              "border-haze-divider/40 flex h-16 shrink-0 items-center gap-3 border-b",
              collapsed ? "justify-center px-1" : "px-4",
            )}
          >
            <div className="gradient-accent shadow-primary/20 flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-foreground block truncate text-[14px] font-bold tracking-tight">
                    SellPilot Admin
                  </span>
                  <span className="shrink-0 rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[8px] leading-none font-extrabold text-violet-500 uppercase">
                    SUPERADMIN
                  </span>
                </div>
                <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                  Platform Control Panel
                </span>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <nav
            className={cn(
              "haze-scrollbar-dark min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-2",
              collapsed && "flex flex-col items-center px-1",
            )}
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                {!collapsed ? (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-muted-foreground/60 text-[10px] font-semibold tracking-[0.08em] uppercase">
                      {group.title}
                    </span>
                  </div>
                ) : (
                  <div className="bg-border/40 mx-2 my-1 h-px w-6" />
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <SidebarNavRow
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      isCollapsed={collapsed}
                      onClick={() => onSelectTab(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Merchant Stores Link */}
            <div className="space-y-1 pt-2">
              {!collapsed ? (
                <div className="px-3 pb-1">
                  <span className="text-muted-foreground/60 text-[10px] font-semibold tracking-[0.08em] uppercase">
                    Switch View
                  </span>
                </div>
              ) : (
                <div className="bg-border/40 mx-2 my-1 h-px w-6" />
              )}
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/onboarding/select-business"
                      className="group text-muted-foreground hover:bg-haze-sidebar-active-bg/20 hover:text-foreground flex h-10 w-10 items-center justify-center rounded-xl"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={14}>
                    Exit to Merchant Stores
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href="/onboarding/select-business"
                  className="group text-muted-foreground hover:bg-haze-sidebar-active-bg/20 hover:text-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all"
                >
                  <div className="text-muted-foreground group-hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                  <span className="flex-1 truncate">
                    Exit to Merchant Stores
                  </span>
                </Link>
              )}
            </div>
          </nav>

          {/* Footer with User profile & Logout */}
          <div className="border-haze-divider/40 shrink-0 border-t p-3">
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <form action={signOut}>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="submit"
                        className="text-muted-foreground h-9 w-9 hover:text-rose-500"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </form>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={14}>
                    Sign Out
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="space-y-3">
                {user && (
                  <div className="flex min-w-0 items-center gap-2.5 px-1">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                      {initials(user.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-xs font-semibold">
                        {user.name}
                      </p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        {user.email}
                      </p>
                    </div>
                  </div>
                )}
                <form action={signOut}>
                  <Button
                    variant="ghost"
                    type="submit"
                    className="h-8 w-full justify-start gap-2.5 rounded-lg px-2 text-[12.5px] font-medium text-rose-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="border-border bg-background text-foreground hover:bg-muted absolute top-12 -right-3 z-50 hidden h-6 w-6 rounded-full border shadow-sm transition-all duration-200 hover:scale-110 md:inline-flex"
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

      {/* Mobile Header Bar */}
      <div className="border-haze-divider bg-card/85 fixed top-0 right-0 left-0 z-40 flex h-14 items-center justify-between border-b px-4 shadow-md backdrop-blur-md md:hidden print:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="bg-haze-sidebar-bg text-haze-sidebar-text w-[80vw] p-0 sm:max-w-xs"
          >
            <div className="flex h-full flex-col p-4">
              <div className="border-haze-divider/40 flex items-center gap-3 border-b pb-4">
                <div className="gradient-accent flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-foreground text-sm font-bold">
                    SellPilot Admin
                  </h3>
                  <span className="text-[9px] font-extrabold tracking-wider text-violet-500 uppercase">
                    Superadmin
                  </span>
                </div>
              </div>

              <nav className="flex-1 space-y-4 py-4">
                {NAV_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-1">
                    <span className="text-muted-foreground/60 px-3 text-[10px] font-semibold tracking-wider uppercase">
                      {group.title}
                    </span>
                    <div className="space-y-0.5 pt-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectTab(item.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                              active
                                ? "bg-primary/15 text-primary font-semibold"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="border-haze-divider/40 border-t pt-4">
                <form action={signOut}>
                  <Button
                    variant="ghost"
                    type="submit"
                    className="w-full justify-start gap-2.5 text-rose-500 hover:bg-rose-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </Button>
                </form>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <div className="gradient-accent flex size-7 items-center justify-center rounded-lg text-xs font-bold text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <span className="text-foreground text-sm font-bold tracking-tight">
            SellPilot Admin
          </span>
        </div>
      </div>
    </>
  );
}
