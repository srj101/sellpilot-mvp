"use client";

import Link from "next/link";
import { LogOut, Store } from "lucide-react";

import { cn } from "@acme/ui";
import { signOut } from "~/app/[businessSlug]/dashboard/(home)/actions";
import { OnboardingProgress } from "./onboarding-progress";

interface OnboardingShellProps {
  current: "chat" | "connect" | "products" | "trial";
  title: string;
  description?: string;
  maxWidthClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function OnboardingShell({
  current,
  title,
  description,
  maxWidthClassName = "max-w-3xl",
  bodyClassName,
  children,
}: OnboardingShellProps) {
  return (
    <main className="auth-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-3 sm:p-6 lg:p-8">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-primary/5",
          maxWidthClassName,
        )}
      >
        {/* Header: brand + progress + log out */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
          <Link
            href="/onboarding/select-business"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="h-4 w-4" />
            </div>
            <span className="hidden text-sm font-semibold sm:inline">SellPilot Setup</span>
          </Link>
          <OnboardingProgress current={current} />
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </form>
        </div>

        {/* Title block */}
        <div className="shrink-0 px-5 pt-6 sm:px-7">
          <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
          {description && <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>

        {/* Body */}
        <div className={cn("scrollbar-thin px-5 pb-6 pt-5 sm:px-7 sm:pb-7", bodyClassName ?? "max-h-[62vh] overflow-y-auto")}>
          {children}
        </div>
      </div>
    </main>
  );
}
