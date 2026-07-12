import Link from "next/link";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  MessageSquare,
  Quote,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

import { ThemeToggle } from "@acme/ui/theme";
import { cn } from "@acme/ui";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

const features = [
  {
    icon: Bot,
    title: "AI sales agent",
    body: "Bangla, English, Banglish across WhatsApp, Facebook, Instagram.",
  },
  {
    icon: ShoppingBag,
    title: "End-to-end checkout",
    body: "Stock check, upsell, payment links, abandoned-cart recovery.",
  },
  {
    icon: MessageSquare,
    title: "Unified inbox",
    body: "Every DM, comment, and status in one conversation view.",
  },
  {
    icon: Zap,
    title: "Live in minutes",
    body: "Connect channels, drop products, the agent starts selling.",
  },
];

const channels = [
  {
    label: "Facebook",
    icon: Facebook,
    color: "text-[#1877F2] bg-[#1877F2]/10 border-[#1877F2]/20",
  },
  {
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-600 bg-pink-500/10 border-pink-500/20",
  },
  {
    label: "WhatsApp",
    icon: MessageCircle,
    color: "text-[#25D366] bg-[#25D366]/10 border-[#25D366]/20",
  },
  {
    label: "Web",
    icon: Globe,
    color: "text-primary bg-primary/10 border-primary/20",
  },
];

const trust = [
  { icon: ShieldCheck, label: "SOC-ready" },
  { icon: CheckCircle2, label: "GDPR-aware" },
  { icon: BarChart3, label: "Insight ready" },
];

function BrandLogo({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="SellPilot"
      width={size}
      height={size}
      className="h-auto w-auto shrink-0 select-none"
      style={{ height: size * 0.32 }}
      draggable={false}
    />
  );
}

/* ─── Infinite marquee (horizontal: right → left) ────────────── */

interface MarqueeProps {
  children: React.ReactNode;
  duration?: number; // seconds for one full cycle
  pauseOnHover?: boolean;
  className?: string;
}

function Marquee({
  children,
  duration = 28,
  pauseOnHover = true,
  className,
}: MarqueeProps) {
  // Duplicate the content so the animation can translateX(-50%) and
  // seamlessly wrap back to the start.
  return (
    <div
      className={cn(
        "marquee-mask relative w-full overflow-hidden",
        pauseOnHover && "marquee-pause-on-hover",
        className,
      )}
    >
      <div
        className="marquee"
        style={{ ["--marquee-duration" as string]: `${duration}s` }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}

/* ─── (no vertical marquee) ───────────────────────────────────────── */

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-3 sm:p-6 lg:p-8">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      {/* Theme toggle + home link, floating outside the card on mobile */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      {/* The card: two-column grid, single rounded card */}
      <div
        className={cn(
          "relative grid w-full max-w-7xl items-stretch overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-primary/5",
          "grid-cols-1 lg:grid-cols-[1fr_1.2fr] xl:grid-cols-[1fr_1.3fr]",
        )}
      >
        {/* ─── Left brand panel (always visible inside the card) ─── */}
        <section className="auth-panel-glow relative hidden flex-col gap-6 overflow-hidden bg-gradient-to-br from-primary/5 via-primary/[0.02] to-background p-7 sm:gap-7 sm:p-9 lg:flex xl:p-11">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 -left-12 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />

          {/* Logo + badge */}
          <div className="relative flex items-start justify-between gap-4">
            <Link href="/" className="inline-flex items-center" aria-label="Home">
              <BrandLogo size={36} />
            </Link>
            <div className="bg-background/80 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </div>
          </div>

          {/* Hero */}
          <div className="relative flex flex-col gap-4">
            <div className="bg-background/70 text-foreground/80 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur">
              <Sparkles className="text-primary size-3" />
              AI commerce OS
            </div>
            <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-balance xl:text-4xl">
              Sell smarter on every channel — automatically.
            </h2>
            <p className="text-muted-foreground text-sm leading-6 xl:text-base">
              Connect WhatsApp, Messenger, and Instagram. Your AI agent
              handles the conversation, the order, and the payment — while
              you focus on the product.
            </p>
          </div>

          {/* Channel pills — infinite left-to-right marquee */}
          <div className="relative">
            <Marquee duration={18} className="py-1">
              {channels.map((ch) => {
                const Icon = ch.icon;
                return (
                  <div
                    key={ch.label}
                    className={cn(
                      "mx-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      ch.color,
                    )}
                  >
                    <Icon className="size-3" />
                    {ch.label}
                  </div>
                );
              })}
            </Marquee>
          </div>

          {/* Feature cards — infinite horizontal marquee (row layout) */}
          <div className="relative -mx-1">
            <Marquee duration={26} className="py-1">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="mx-1.5 flex w-56 shrink-0 flex-col gap-1.5 rounded-xl border bg-background/60 p-3 backdrop-blur"
                  >
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="size-3.5" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {feature.title}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-xs leading-5">
                      {feature.body}
                    </p>
                  </div>
                );
              })}
            </Marquee>
          </div>

          {/* Testimonial */}
          <figure className="relative mt-auto rounded-xl border bg-background/70 p-4 backdrop-blur">
            <Quote className="text-primary/40 size-5" />
            <blockquote className="text-foreground mt-1 text-sm leading-6">
              &ldquo;We replaced 3 part-time agents with SellPilot. First-month
              AOV up 41%, response time down to 12 seconds.&rdquo;
            </blockquote>
            <figcaption className="text-muted-foreground mt-3 flex items-center gap-2.5 text-xs">
              <span className="bg-primary/15 text-primary flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold">
                FA
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-foreground text-xs font-semibold">
                  Farhan Ahmed
                </span>
                <span className="text-muted-foreground/80">
                  Founder, Aurora Goods
                </span>
              </span>
              <span className="ml-auto flex items-center gap-0.5 text-amber-500">
                <Star className="size-3 fill-current" />
                <Star className="size-3 fill-current" />
                <Star className="size-3 fill-current" />
                <Star className="size-3 fill-current" />
                <Star className="size-3 fill-current" />
              </span>
            </figcaption>
          </figure>

          {/* Trust signals footer */}
          <div className="relative flex flex-wrap items-center gap-1.5">
            {trust.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.label}
                  className="bg-background/65 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                >
                  <Icon className="text-primary size-3" />
                  {t.label}
                </div>
              );
            })}
            <span className="text-muted-foreground/60 ml-auto text-[10px]">
              © SellPilot · v1.0
            </span>
          </div>
        </section>

        {/* ─── Right form panel (always visible) ─────────────────── */}
        <section className="relative flex items-center justify-center p-4 sm:p-6 lg:p-8 xl:p-10">
          {/* Mobile logo (hidden on lg+) */}
          <Link
            href="/"
            className="absolute top-4 left-4 inline-flex items-center lg:hidden"
            aria-label="Home"
          >
            <BrandLogo size={28} />
          </Link>

          <div className="w-full max-w-lg pt-12 sm:pt-4 lg:pt-0">
            <div className="mb-6 flex flex-col gap-2.5 sm:mb-7">
              <div className="text-primary text-[11px] font-semibold tracking-[0.18em] uppercase">
                {eyebrow}
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">
                {title}
              </h1>
              <p className="text-muted-foreground text-sm leading-6">
                {description}
              </p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
