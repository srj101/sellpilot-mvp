import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Facebook,
  Instagram,
  MessageCircle,
  RadioTower,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { cn } from "@acme/ui";
import { ThemeToggle } from "@acme/ui/theme";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

const channels = [
  {
    label: "Facebook",
    value: "2 pages",
    icon: Facebook,
  },
  {
    label: "Instagram",
    value: "1 account",
    icon: Instagram,
  },
  {
    label: "WhatsApp",
    value: "ready",
    icon: MessageCircle,
  },
];

const metrics = [
  {
    label: "Response coverage",
    value: "94%",
    tone: "primary",
  },
  {
    label: "Lead handoff",
    value: "4m",
    tone: "accent",
  },
  {
    label: "Revenue signals",
    value: "+31",
    tone: "muted",
  },
];

const trustSignals = [
  {
    label: "Verified auth",
    icon: ShieldCheck,
  },
  {
    label: "Social OAuth",
    icon: CheckCircle2,
  },
  {
    label: "Insight ready",
    icon: BarChart3,
  },
];

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-mesh relative flex min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="relative mx-auto grid w-full max-w-7xl items-stretch gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="bg-card/60 shadow-primary/10 relative hidden min-h-[calc(100vh-3rem)] overflow-hidden rounded-lg border p-8 shadow-2xl backdrop-blur-xl lg:flex lg:flex-col lg:justify-between">
          <div className="auth-panel-glow pointer-events-none absolute inset-0" />
          <div className="relative flex items-center justify-between">
            <Link
              href="/"
              className="group inline-flex items-center gap-3 text-sm font-semibold tracking-tight"
            >
              <span className="bg-background grid size-10 place-items-center rounded-md border shadow-sm transition-transform group-hover:-translate-y-0.5">
                <Sparkles className="text-primary size-4" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-base">SellPilot</span>
                <span className="text-muted-foreground mt-1 text-xs font-medium tracking-[0.22em] uppercase">
                  Commerce cockpit
                </span>
              </span>
            </Link>
            <div className="bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium">
              Secure session
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-8 py-12">
            <div className="flex flex-col gap-4">
              <div className="bg-background/70 text-muted-foreground inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
                <RadioTower className="text-primary size-3.5" />
                Live channel intelligence
              </div>
              <h2 className="max-w-xl text-5xl leading-[0.95] font-semibold tracking-[-0.05em] text-balance">
                One premium control room for every customer conversation.
              </h2>
              <p className="text-muted-foreground max-w-lg text-base leading-7">
                Connect your page, Instagram, and WhatsApp presence, then let
                SellPilot turn social demand into qualified conversations.
              </p>
            </div>

            <div className="auth-console bg-background/80 shadow-primary/10 relative overflow-hidden rounded-lg border p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-primary size-2 rounded-full" />
                  <span className="text-sm font-medium">Signal board</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  Synced just now
                </span>
              </div>

              <div className="grid gap-3">
                {channels.map((channel, index) => {
                  const Icon = channel.icon;

                  return (
                    <div
                      className="auth-reveal bg-card/70 flex items-center justify-between rounded-md border px-4 py-3"
                      key={channel.label}
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="bg-primary/10 text-primary grid size-9 place-items-center rounded-md">
                          <Icon className="size-4" />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-sm font-medium">
                            {channel.label}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Account connection
                          </span>
                        </span>
                      </div>
                      <span className="text-sm font-semibold">
                        {channel.value}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div
                    className={cn(
                      "bg-background/70 rounded-md border p-3",
                      metric.tone === "primary" && "border-primary/40",
                    )}
                    key={metric.label}
                  >
                    <div className="text-xl font-semibold tracking-tight">
                      {metric.value}
                    </div>
                    <div className="text-muted-foreground mt-1 text-[11px] leading-4">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-3">
            {trustSignals.map((signal) => {
              const Icon = signal.icon;

              return (
                <div
                  className="bg-background/65 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium"
                  key={signal.label}
                >
                  <Icon className="text-primary size-3.5" />
                  {signal.label}
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-card/80 shadow-primary/10 flex min-h-[calc(100vh-3rem)] items-center justify-center rounded-lg border p-4 shadow-2xl backdrop-blur-xl sm:p-6 lg:p-10">
          <div className="absolute top-4 right-4 lg:hidden">
            <ThemeToggle />
          </div>
          <div className="w-full max-w-md">
            <div className="mb-8 flex flex-col gap-3">
              <Link
                href="/"
                className="inline-flex w-fit items-center gap-2 text-sm font-semibold lg:hidden"
              >
                <span className="bg-background grid size-9 place-items-center rounded-md border shadow-sm">
                  <Sparkles className="text-primary size-4" />
                </span>
                SellPilot
              </Link>
              <div className="text-primary text-xs font-semibold tracking-[0.22em] uppercase">
                {eyebrow}
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                  {title}
                </h1>
                <p className="text-muted-foreground text-sm leading-6">
                  {description}
                </p>
              </div>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
