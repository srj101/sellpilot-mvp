"use client";

import { CheckCircle2, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

export function StepTrialStarted({
  businessSlug,
  trialEndsAt,
}: {
  businessSlug: string;
  trialEndsAt?: string;
}) {
  const trpc = useTRPC();
  const completeOnboarding = useMutation(trpc.business.completeOnboarding.mutationOptions());
  const [dateStr, setDateStr] = useState("");
  const [navigating, setNavigating] = useState(false);

  async function handleGoToDashboard() {
    setNavigating(true);
    try {
      // Marks the wizard as actually finished — until this lands, [businessSlug]/layout.tsx
      // would bounce a returning visitor back into the wizard instead of the dashboard.
      // Awaited (not fire-and-forget) so the redirect below can't race ahead of the write.
      await completeOnboarding.mutateAsync();
    } catch {
      // Best-effort — don't trap the user on the confirmation screen over this.
    }
    window.location.href = `/${businessSlug}/dashboard`;
  }

  useEffect(() => {
    const date = trialEndsAt
      ? new Date(trialEndsAt)
      : (() => {
          const fallback = new Date();
          fallback.setDate(fallback.getDate() + 14);
          return fallback;
        })();
    setDateStr(date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  }, [trialEndsAt]);

  return (
    <main className="auth-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-3 sm:p-6 lg:p-8">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-8 text-center shadow-2xl shadow-primary/5">
        {/* Confetti / background effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>

          <h1 className="mb-2 text-2xl font-bold tracking-tight">Your 14-day Pro trial is active!</h1>
          
          <div className="mb-8 rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground">
            Trial ends on {dateStr || "..."}
          </div>

          <div className="mb-8 w-full rounded-xl border bg-background/50 p-4 text-left">
            <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What's included in Pro:
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Unlimited AI Conversations
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Unlimited Products
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                All Integrations (WhatsApp, Messenger, IG)
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                No payment method required yet
              </li>
            </ul>
          </div>

          <button
            onClick={handleGoToDashboard}
            disabled={navigating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {navigating ? "Redirecting..." : "Go to Dashboard"}
            {navigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </main>
  );
}
