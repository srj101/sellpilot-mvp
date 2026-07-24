"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,

  LogOut,
  Mail,
  Plus,
  Sparkles,
  Store,
  X,
} from "lucide-react";

import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { signOut } from "~/app/[storeSlug]/dashboard/(home)/actions";

/* ─── Gradient pools ─────────────────────────────────────────────────── */

const CARD_BG = [
  "from-violet-600 via-purple-600 to-indigo-700",
  "from-teal-500 via-emerald-600 to-cyan-700",
  "from-amber-500 via-orange-500 to-rose-600",
  "from-blue-600 via-indigo-600 to-violet-700",
  "from-rose-500 via-pink-600 to-fuchsia-700",
  "from-sky-500 via-cyan-600 to-teal-700",
];

const AVATAR_BG = [
  "from-violet-400/30 to-purple-300/20",
  "from-teal-400/30 to-emerald-300/20",
  "from-amber-400/30 to-orange-300/20",
  "from-blue-400/30 to-indigo-300/20",
  "from-rose-400/30 to-pink-300/20",
  "from-sky-400/30 to-cyan-300/20",
];

function pick<T>(arr: T[], name: string): T {
  const n = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return arr[n % arr.length]!;
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "ST";
}

/* ─── Store card (matches reference screenshot layout exactly) ─────────── */

function StoreCard({
  name,
  role,
  isActive,
  isPending,
  onEnter,
}: {
  name: string;
  role: string;
  isActive: boolean;
  isPending: boolean;
  onEnter: () => void;
}) {
  const cardBg = pick(CARD_BG, name);
  const avatarBg = pick(AVATAR_BG, name);
  const isOwner = role === "owner";

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        isActive && "ring-2 ring-primary/50",
      )}
    >
      {/* ── Image / avatar area ── */}
      <div className={cn("relative flex h-44 items-center justify-center bg-gradient-to-br", cardBg)}>
        {/* Soft inner vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        {/* Store avatar (fallback initials) */}
        <div
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-2xl",
            "bg-gradient-to-br backdrop-blur-sm",
            "ring-4 ring-white/25 shadow-2xl",
            avatarBg,
            "bg-white/20",
          )}
        >
          <span className="text-2xl font-extrabold tracking-tight text-white drop-shadow-lg">
            {initials(name)}
          </span>
        </div>

        {/* Active pulse badge */}
        {isActive && (
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Active
          </span>
        )}


      </div>

      {/* ── Card body ── */}
      <div className="flex flex-1 flex-col px-4 pt-4 pb-3">
        {/* Name */}
        <h3 className="truncate text-base font-bold text-foreground">{name}</h3>

        {/* Tag badges — like EU38, BLACK/WHITE in the reference */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize",
              isOwner
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
            )}
          >
            {isOwner ? "Owner" : role}
          </span>
          <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Free
          </span>
        </div>

        {/* Description */}
        <p className="mt-2.5 flex-1 text-xs leading-relaxed text-muted-foreground">
          {isActive
            ? "This is your currently active store dashboard."
            : "Enter this store to manage orders, products, customers and more."}
        </p>
      </div>

      {/* ── Bottom bar — PLAN + Enter button (mirrors PRICE + Add to cart) ── */}
      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Plan</p>
          <p className="text-sm font-bold text-foreground">Free</p>
        </div>
        <button
          onClick={onEnter}
          disabled={isPending}
          className={cn(
            "group/btn relative flex h-9 items-center justify-center gap-2 overflow-hidden rounded-xl px-4",
            "bg-foreground text-sm font-semibold text-background",
            "transition-all duration-200 hover:bg-foreground/85 active:scale-95",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "min-w-[100px]",
          )}
        >
          <span className="transition-transform duration-200 group-hover/btn:-translate-x-1">
            Enter
          </span>
          <ArrowRight className="h-3.5 w-3.5 transition-all duration-200 group-hover/btn:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Invitation row ─────────────────────────────────────────────────── */

function InvitationRow({
  organizationName,
  roleLabel,
  onAccept,
  onDecline,
  isPendingAccept,
  isPendingDecline,
}: {
  organizationName: string;
  roleLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  isPendingAccept: boolean;
  isPendingDecline: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
        <Mail className="h-4 w-4 text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{organizationName}</p>
        <p className="text-xs text-muted-foreground">
          Invited as{" "}
          <span className="font-medium capitalize text-amber-500">{roleLabel}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onDecline}
          disabled={isPendingDecline || isPendingAccept}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          aria-label="Decline"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onAccept}
          disabled={isPendingAccept || isPendingDecline}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:bg-primary/90 disabled:opacity-50"
          aria-label="Accept"
        >
          <Check className="h-3 w-3" />
          Accept
        </button>
      </div>
    </div>
  );
}

/* ─── Skeleton cards ─────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-44 animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-9 w-24 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function SelectStoreClient() {
  const trpc = useTRPC();

  const storesQuery = useQuery(trpc.org.listMine.queryOptions());
  const invitationsQuery = useQuery(trpc.roles.listMyInvitations.queryOptions());
  const setActive = useMutation(trpc.org.setActive.mutationOptions());
  const acceptInvitation = useMutation(trpc.roles.acceptInvitation.mutationOptions());
  const rejectInvitation = useMutation(trpc.roles.rejectInvitation.mutationOptions());

  function enterStore(organizationId: string, slug: string) {
    setActive.mutate(
      { organizationId },
      {
        onSuccess: () => { window.location.href = `/${slug}/dashboard`; },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function handleAccept(invitationId: string) {
    acceptInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => {
          toast.success("Invitation accepted");
          storesQuery.refetch();
          invitationsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function handleReject(invitationId: string) {
    rejectInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => {
          toast.success("Invitation declined");
          invitationsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const stores = storesQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ═══ App header ═══════════════════════════════════════════════ */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
            <Store className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight">SellPilot</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium text-muted-foreground">My Stores</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </header>

      {/* ═══ Page body ════════════════════════════════════════════════ */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">

        {/* ── Pending invitations ── */}
        {invitations.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-foreground">Pending Invitations</h2>
              <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-500">
                {invitations.length}
              </span>
            </div>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  organizationName={inv.organizationName}
                  roleLabel={inv.customRoleKey ?? inv.role ?? "member"}
                  onAccept={() => handleAccept(inv.id)}
                  onDecline={() => handleReject(inv.id)}
                  isPendingAccept={acceptInvitation.isPending}
                  isPendingDecline={rejectInvitation.isPending}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── My Stores section ── */}
        <section>
          {/* Section header row — title + Create button on same line */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">My Stores</h1>
              {!storesQuery.isLoading && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stores.length === 0
                    ? "You don't have any stores yet."
                    : `${stores.length} store${stores.length > 1 ? "s" : ""}`}
                </p>
              )}
            </div>
            <Link href="/onboarding/create-store">
              <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-95">
                <Plus className="h-3.5 w-3.5" />
                Create Store
              </button>
            </Link>
          </div>

          {/* Store grid */}
          {storesQuery.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : stores.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold text-foreground">No stores yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hit "Create Store" above to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((s) => (
                <StoreCard
                  key={s.organizationId}
                  name={s.name}
                  role={s.role}
                  isActive={s.isActive}
                  isPending={setActive.isPending}
                  onEnter={() => enterStore(s.organizationId, s.slug)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ═══ Footer ═══════════════════════════════════════════════════ */}
      <footer className="flex items-center justify-center gap-1.5 py-6 text-[11px] text-muted-foreground/40">
        <Sparkles className="h-3 w-3" />
        Powered by SellPilot AI
      </footer>
    </div>
  );
}
