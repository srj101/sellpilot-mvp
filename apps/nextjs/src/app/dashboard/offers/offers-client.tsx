"use client";

import { useMemo, useState } from "react";
import {
  Percent,
  Tag,
  Calendar,
  CheckCircle2,
  XCircle,
  Copy,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";

type Offer = {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  type: string;
  value: number;
  minSubtotal: number;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  createdAt: Date;
};

function formatCurrency(amount: number) {
  return `৳${amount.toLocaleString()}`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export function OffersClient({ initialOffers }: { initialOffers: Offer[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const now = new Date();
    return initialOffers.filter((o) => {
      if (filter === "active") return o.active && (!o.endDate || new Date(o.endDate) > now);
      if (filter === "expired") return !o.active || (o.endDate && new Date(o.endDate) <= now);
      return true;
    });
  }, [initialOffers, filter]);

  const stats = useMemo(() => {
    const now = new Date();
    const active = initialOffers.filter(
      (o) => o.active && (!o.endDate || new Date(o.endDate) > now),
    ).length;
    const expired = initialOffers.length - active;
    return { total: initialOffers.length, active, expired };
  }, [initialOffers]);

  const handleCopy = (code: string, id: string) => {
    copyToClipboard(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Offers</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Manage discount codes and promotional offers.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Offers", value: stats.total, color: "from-violet-500/10 to-violet-600/5 dark:from-violet-500/20 dark:to-violet-600/10", text: "text-violet-600 dark:text-violet-400" },
          { label: "Active", value: stats.active, color: "from-emerald-500/10 to-emerald-600/5 dark:from-emerald-500/20 dark:to-emerald-600/10", text: "text-emerald-600 dark:text-emerald-400" },
          { label: "Expired", value: stats.expired, color: "from-rose-500/10 to-rose-600/5 dark:from-rose-500/20 dark:to-rose-600/10", text: "text-rose-600 dark:text-rose-400" },
        ].map((s) => (
          <div
            key={s.label}
            className={cn(
              "rounded-2xl border bg-gradient-to-br p-4 transition-shadow hover:shadow-md",
              s.color,
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", s.text)}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {(["all", "active", "expired"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Offers Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16">
          <Percent className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No offers found
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const now = new Date();
            const isActive = o.active && (!o.endDate || new Date(o.endDate) > now);
            const discountLabel =
              o.type === "percentage" ? `${o.value}% OFF` : `${formatCurrency(o.value)} OFF`;

            return (
              <div
                key={o.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg",
                  !isActive && "opacity-60",
                )}
              >
                {/* Discount Badge */}
                <div className="mb-4 flex items-center justify-between">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold",
                      o.type === "percentage"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    )}
                  >
                    {o.type === "percentage" ? (
                      <Percent className="h-4 w-4" />
                    ) : (
                      <Tag className="h-4 w-4" />
                    )}
                    {discountLabel}
                  </div>
                  {isActive ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Expired
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-foreground">{o.title}</h3>
                {o.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {o.description}
                  </p>
                )}

                {/* Code */}
                {o.code && (
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-dashed bg-muted/50 px-3 py-1.5 text-center text-sm font-mono font-bold tracking-widest">
                      {o.code}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(o.code!, o.id)}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                      <span className="ml-1 text-xs">
                        {copiedId === o.id ? "Copied!" : "Copy"}
                      </span>
                    </Button>
                  </div>
                )}

                {/* Details */}
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  {o.minSubtotal > 0 && (
                    <p>Min. order: {formatCurrency(o.minSubtotal)}</p>
                  )}
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(o.startDate)}
                    {o.endDate && ` – ${formatDate(o.endDate)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
