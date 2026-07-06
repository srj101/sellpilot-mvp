"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

function SidebarContent() {
  const pathname = usePathname();
  const activeIndex = getActiveIndex(pathname);

  return (
    <div className="flex h-full flex-col px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-center gap-2.5">
        <span className="bg-primary h-3 w-3 rounded-full" />
        <span className="text-xl font-bold tracking-tight text-foreground">
          SellPilot
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeIndex === index;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive
                  ? "bg-background/50 font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50",
                )}
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span className="pl-2">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <form action={signOut} className="pt-6">
        <Button
          variant="outline"
          type="submit"
          className="w-full justify-start gap-2.5"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </form>
    </div>
  );
}

export function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 p-4 pr-0 md:block">
        <div className="bg-card flex h-[calc(100vh-2rem)] flex-col rounded-[28px] border shadow-lg">
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
