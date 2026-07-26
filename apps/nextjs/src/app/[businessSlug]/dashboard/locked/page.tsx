import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle2, LifeBuoy } from "lucide-react";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { LockedPlanPicker } from "./locked-plan-picker";

const REASON_COPY: Record<string, { title: string; body: string }> = {
  trial_expired: {
    title: "Your trial has ended",
    body: "Your 14-day trial is over. Upgrade to a paid plan to keep your AI agent selling.",
  },
  cancelled: {
    title: "Subscription cancelled",
    body: "This business's subscription was cancelled. Reactivate a plan to regain access.",
  },
  past_due: {
    title: "Payment past due",
    body: "We couldn't process your last payment. Update your plan to restore access.",
  },
};

export default async function LockedPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { businessSlug } = await params;
  const caller = await createCaller(await headers());
  const lock = await caller.business.checkLockStatus();

  // Defensive: a stale bookmark or a plan that was just reactivated shouldn't show this page.
  if (!lock.locked) redirect(`/${businessSlug}/dashboard`);

  const copy = REASON_COPY[lock.reason ?? ""] ?? REASON_COPY.trial_expired!;

  return (
    <main className="auth-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-3 sm:p-6 lg:p-8">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="relative w-full max-w-2xl rounded-3xl border bg-card p-8 text-center shadow-2xl shadow-primary/5 sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{copy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.body}</p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          All your business data is safe and preserved
        </div>

        <LockedPlanPicker />

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/demo"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Contact Sales to Upgrade
          </Link>
          <a
            href="mailto:support@sellpilot.ai"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <LifeBuoy className="h-4 w-4" />
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
}
