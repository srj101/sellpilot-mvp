"use client";

import Link from "next/link";
import { Bell, LogOut, User as UserIcon } from "lucide-react";

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

export function FloatingHeader({
  user,
}: {
  user: { name: string; email: string; image: string | null } | null;
}) {
  return (
    <div className="fixed right-4 top-4 z-40 hidden items-center gap-3 rounded-full border border-white/25 bg-white/10 px-4 py-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:flex">

      <Link
        href="/dashboard/notifications"
        aria-label="Notifications"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
      </Link>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary transition-transform hover:scale-105"
          >
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar URL, not a static asset
              <img src={user.image} alt="" className="h-full w-full object-cover" />
            ) : user ? (
              initials(user.name)
            ) : (
              <UserIcon className="h-4 w-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium text-foreground">{user?.name ?? "Account"}</p>
            {user?.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">Profile settings</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
