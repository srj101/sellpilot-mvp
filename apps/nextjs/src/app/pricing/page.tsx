import Link from "next/link";

import { ThemeToggle } from "@acme/ui/theme";

import { PlanGrid } from "~/app/_components/pricing/plan-grid";

export default function PricingPage() {
  return (
    <main className="auth-mesh relative min-h-screen overflow-x-hidden">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="absolute top-4 right-4 z-10 flex items-center gap-3 sm:top-6 sm:right-6">
        <Link
          href="/login"
          className="bg-background/70 text-foreground/80 hover:text-foreground hover:border-primary/30 inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors"
        >
          Sign in
        </Link>
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-3 flex flex-col items-center gap-1.5 text-center md:mb-4">
          <div className="text-primary text-[11px] font-semibold tracking-[0.18em] uppercase">Pricing</div>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">
            Flexible plans tailored to your growth
          </h1>
          <p className="max-w-xl text-xs leading-5 text-muted-foreground sm:text-sm">
            A 14-day free trial on every plan. No card required. Cancel anytime.
          </p>
        </div>

        <PlanGrid mode="public" compact />

        <p className="mt-3 text-center text-[11px] text-muted-foreground md:mt-4">
          Prices in Bangladeshi Taka (৳). Need something bigger?{" "}
          <Link href="/demo" className="font-medium text-primary hover:underline">
            Talk to sales
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
