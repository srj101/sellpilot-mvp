"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, User as UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { ThemeToggle } from "@acme/ui/theme";

import { signOut } from "../actions";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const capitalize = (s: string) => {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function FloatingHeader({
  user,
}: {
  user: { name: string; email: string; image: string | null } | null;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Generate breadcrumbs: e.g. /dashboard/analytics -> Dashboard / Analytics
  const breadcrumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    const label = capitalize(seg === "dashboard" ? "Dashboard" : seg);
    const isLast = idx === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <header className="glass-overlay sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-haze-divider/40 px-6 hidden md:flex shrink-0">
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
        <Link
          href="/dashboard/notifications"
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-haze-sidebar-active-bg/30 hover:text-foreground transition-all duration-200"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute -top-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white ring-1 ring-background">
            4
          </span>
        </Link>
        
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
              <Link href="/dashboard/settings">Profile settings</Link>
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
