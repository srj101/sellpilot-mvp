"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,
  Clock,
  Loader2,
  LogOut,
  Mail,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { signOut } from "~/app/[businessSlug]/dashboard/(home)/actions";

/* ─── Gradient pools ─────────────────────────────────────────────────── */

const CARD_BG = [
  "from-violet-600 via-purple-600 to-indigo-700",
  "from-teal-500 via-emerald-600 to-cyan-700",
  "from-amber-500 via-orange-500 to-rose-600",
  "from-blue-600 via-indigo-600 to-violet-700",
  "from-rose-500 via-pink-600 to-fuchsia-700",
  "from-sky-500 via-cyan-600 to-teal-700",
];


function pick<T>(arr: T[], name: string): T {
  const n = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return arr[n % arr.length]!;
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "ST";
}

/* ─── Store card (connector-card style: banner + overlapping icon chip) ── */

const DOT_PATTERN: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)",
  backgroundSize: "14px 14px",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Plain-text "Expires <date>" once >24h remain; switches to a live HH:MM:SS countdown inside the last 24h. */
function ExpiryLine({ currentPeriodEnd }: { currentPeriodEnd: string | Date | null }) {
  const endMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  const msRemaining = endMs !== null ? endMs - now : null;
  const isUrgent = msRemaining !== null && msRemaining > 0 && msRemaining <= DAY_MS;

  useEffect(() => {
    if (!isUrgent) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isUrgent]);

  if (endMs === null) return null;

  if (msRemaining !== null && msRemaining <= 0) {
    return <p className="text-[11px] font-semibold text-destructive">Expired</p>;
  }

  if (isUrgent) {
    return (
      <p className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        {formatCountdown(msRemaining)} left
      </p>
    );
  }

  return (
    <p className="text-[11px] text-muted-foreground">
      Expires {new Date(endMs).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
    </p>
  );
}

function StoreCard({
  name,
  role,
  isActive,
  isPending,
  isEntering,
  plan,
  subscriptionStatus,
  currentPeriodEnd,
  onEnter,
}: {
  name: string;
  role: string;
  isActive: boolean;
  isPending: boolean;
  isEntering: boolean;
  plan: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | Date | null;
  onEnter: () => void;
}) {
  const cardBg = pick(CARD_BG, name);
  const isOwner = role === "owner";
  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Free";

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md",
        "transition-colors duration-300 hover:border-primary/30",
        isActive && "ring-2 ring-primary/50",
      )}
    >
      {/* ── Banner ── */}
      <div className={cn("relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br px-4", cardBg)}>
        <div className="pointer-events-none absolute inset-0" style={DOT_PATTERN} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

        <h3 className="relative truncate text-lg font-extrabold tracking-tight text-white drop-shadow-md">
          {name}
        </h3>

        {isActive && (
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Active
          </span>
        )}
      </div>

      {/* ── Icon chip — overlaps the banner/body seam ── */}
      <div className="px-4">
        <div
          className={cn(
            "relative -mt-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ring-4 ring-card",
            cardBg,
          )}
        >
          <span className="text-base font-extrabold tracking-tight text-white">{initials(name)}</span>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="flex flex-1 flex-col px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-bold text-foreground">{name}</h4>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
              isOwner
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
            )}
          >
            {isOwner ? "Owner" : role}
          </span>
        </div>

        <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
          {isActive
            ? "This is your currently active business dashboard."
            : "Enter this business to manage orders, products, customers and more."}
        </p>
      </div>

      {/* ── Footer: plan + expiry on the left, Enter on the right ── */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-foreground">
            {planLabel}
            {subscriptionStatus === "trialing" ? " Trial" : " Plan"}
          </p>
          <ExpiryLine currentPeriodEnd={currentPeriodEnd} />
        </div>
        <button
          onClick={onEnter}
          disabled={isPending}
          className={cn(
            "group/btn flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground",
            "transition-all hover:scale-105 hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
          )}
        >
          {isEntering ? "Entering..." : "Enter"}
          {isEntering ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Invitation row ─────────────────────────────────────────────────── */

function InvitationRow({
  businessName,
  roleLabel,
  onAccept,
  onDecline,
  isPendingAccept,
  isPendingDecline,
}: {
  businessName: string;
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
        <p className="truncate text-sm font-semibold text-foreground">{businessName}</p>
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
          {isPendingDecline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onAccept}
          disabled={isPendingAccept || isPendingDecline}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:bg-primary/90 disabled:opacity-50"
          aria-label="Accept"
        >
          {isPendingAccept ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {isPendingAccept ? "Accepting..." : "Accept"}
        </button>
      </div>
    </div>
  );
}

/* ─── Skeleton cards ─────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Banner */}
      <div className="h-24 animate-pulse bg-muted" />

      {/* Icon chip overlapping the seam */}
      <div className="px-4">
        <div className="-mt-6 h-12 w-12 animate-pulse rounded-xl bg-muted ring-4 ring-card" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mt-1 h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-14 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function SelectBusinessClient() {
  const trpc = useTRPC();

  const storesQuery = useQuery(trpc.business.listMine.queryOptions());
  const invitationsQuery = useQuery(trpc.roles.listMyInvitations.queryOptions());
  const setActive = useMutation(trpc.business.setActive.mutationOptions());
  const acceptInvitation = useMutation(trpc.roles.acceptInvitation.mutationOptions());
  const rejectInvitation = useMutation(trpc.roles.rejectInvitation.mutationOptions());

  const [enteringBusinessId, setEnteringBusinessId] = useState<string | null>(null);
  const [invitationAction, setInvitationAction] = useState<{ id: string; type: "accept" | "decline" } | null>(null);

  function enterStore(businessId: string, slug: string) {
    setEnteringBusinessId(businessId);
    setActive.mutate(
      { businessId },
      {
        onSuccess: () => { window.location.href = `/${slug}/dashboard/loading`; },
        onError: (e) => {
          setEnteringBusinessId(null);
          toast.error(e.message);
        },
      },
    );
  }

  function handleAccept(invitationId: string) {
    setInvitationAction({ id: invitationId, type: "accept" });
    acceptInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => {
          toast.success("Invitation accepted");
          storesQuery.refetch();
          invitationsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setInvitationAction(null),
      },
    );
  }

  function handleReject(invitationId: string) {
    setInvitationAction({ id: invitationId, type: "decline" });
    rejectInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => {
          toast.success("Invitation declined");
          invitationsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setInvitationAction(null),
      },
    );
  }

  const stores = storesQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  return (
    <div className="auth-mesh relative flex h-screen flex-col overflow-hidden">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      {/* ═══ Page body ════════════════════════════════════════════════ */}
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex h-[90vh] w-full flex-col rounded-3xl border bg-card/90 p-6 shadow-2xl shadow-primary/5 backdrop-blur-sm sm:p-8">

          {/* ── Pending invitations ── */}
          {invitations.length > 0 && (
            <section className="mb-8 shrink-0">
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
                    businessName={inv.businessName}
                    roleLabel={inv.customRoleKey ?? inv.role ?? "member"}
                    onAccept={() => handleAccept(inv.id)}
                    onDecline={() => handleReject(inv.id)}
                    isPendingAccept={invitationAction?.id === inv.id && invitationAction.type === "accept"}
                    isPendingDecline={invitationAction?.id === inv.id && invitationAction.type === "decline"}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── My Businesses section ── */}
          <section className="flex min-h-0 flex-1 flex-col">
            {/* Section header row — title + Create button on same line */}
            <div className="mb-6 flex shrink-0 items-center justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">My Businesses</h1>
                {!storesQuery.isLoading && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stores.length === 0
                      ? "You don't have any businesses yet."
                      : `${stores.length} business${stores.length > 1 ? "es" : ""}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </form>
                <Link href="/onboarding/create-business">
                  <button className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-95">
                    <Plus className="h-3.5 w-3.5" />
                    Create Business
                  </button>
                </Link>
              </div>
            </div>

            {/* Business grid — the only scrollable region */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                    <p className="font-semibold text-foreground">No businesses yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Hit "Create Business" above to get started
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 p-1">
                  {stores.map((s) => (
                    <StoreCard
                      key={s.businessId}
                      name={s.name}
                      role={s.roleLabel}
                      isActive={s.isActive}
                      isPending={!!enteringBusinessId}
                      isEntering={enteringBusinessId === s.businessId}
                      plan={s.plan}
                      subscriptionStatus={s.subscriptionStatus}
                      currentPeriodEnd={s.currentPeriodEnd}
                      onEnter={() => enterStore(s.businessId, s.slug)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* ═══ Footer ═══════════════════════════════════════════════════ */}
      <footer className="relative z-10 shrink-0 flex items-center justify-center gap-1.5 py-3 text-[11px] text-muted-foreground/40">
        <Sparkles className="h-3 w-3" />
        Powered by SellPilot AI
      </footer>
    </div>
  );
}
