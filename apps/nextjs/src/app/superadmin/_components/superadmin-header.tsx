"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  LogOut,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { ThemeToggle } from "@acme/ui/theme";

import type { SuperadminTab } from "./superadmin-sidebar";
import { signOut } from "~/app/[businessSlug]/dashboard/(home)/actions";

const TAB_LABELS: Record<SuperadminTab, string> = {
  overview: "Platform Overview",
  stores: "Stores Directory",
  ai: "AI Usage & Observability",
  queues: "Queues & Worker Health",
  channels: "Meta Channel Health",
  broadcasts: "System Broadcasts",
  users: "User Management",
  audit: "Platform Security & Audit Trail",
  payments: "Payment Gateways",
  bugs: "Bug Reports & Triage",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "SA";
}

export function SuperadminHeader({
  activeTab,
  user,
}: {
  activeTab: SuperadminTab;
  user?: { name: string; email: string; image?: string | null } | null;
}) {
  return (
    <header className="glass-overlay border-haze-divider/40 sticky top-0 z-30 flex hidden h-16 w-full shrink-0 items-center justify-between gap-4 border-b px-6 md:flex print:hidden">
      {/* Breadcrumb navigation */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-xs font-medium tracking-tight">
          <li className="text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="text-primary h-3.5 w-3.5" />
            <span>SellPilot Admin</span>
          </li>
          <li className="text-muted-foreground/40 font-normal">/</li>
          <li className="text-foreground font-semibold">
            {TAB_LABELS[activeTab]}
          </li>
        </ol>
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-8 gap-1.5 text-xs"
        >
          <Link href="/onboarding/select-business">
            <span>Exit to Stores</span>
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-muted focus:ring-ring flex items-center gap-2 rounded-full p-1 transition-colors focus:ring-2 focus:outline-none"
            >
              {user?.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="ring-border h-8 w-8 rounded-full object-cover ring-1"
                />
              ) : (
                <div className="bg-primary/10 text-primary ring-border flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ring-1">
                  {user ? (
                    initials(user.name)
                  ) : (
                    <UserIcon className="h-4 w-4" />
                  )}
                </div>
              )}
              <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="border-border bg-card w-56 rounded-xl p-1 shadow-lg"
          >
            {user && (
              <>
                <DropdownMenuLabel className="p-2 font-normal">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs leading-none font-semibold">
                        {user.name}
                      </p>
                      <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] leading-none font-extrabold text-violet-500 uppercase">
                        Superadmin
                      </span>
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-none">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/40" />
              </>
            )}
            <DropdownMenuItem asChild className="cursor-pointer text-xs">
              <Link
                href="/onboarding/select-business"
                className="flex items-center gap-2"
              >
                <ArrowUpRight className="text-muted-foreground h-3.5 w-3.5" />
                <span>Switch to Merchant View</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/40" />
            <form action={signOut}>
              <DropdownMenuItem
                asChild
                className="cursor-pointer text-xs text-rose-500 focus:bg-rose-500/10 focus:text-rose-600"
              >
                <button
                  type="submit"
                  className="flex w-full items-center gap-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
