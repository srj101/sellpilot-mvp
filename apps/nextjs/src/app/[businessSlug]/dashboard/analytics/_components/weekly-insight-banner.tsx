"use client";

import { Bot, Sparkles, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@acme/ui/card";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

interface RevenueStats {
  revenue: number;
  revenueTrend: number | null;
  orderCount: number;
  orderCountTrend: number | null;
  aov: number;
  aovTrend: number | null;
  returnRate: number;
  returnRateTrend: number | null;
}

export function WeeklyInsightBanner({
  revenueStats,
  topProducts,
}: {
  revenueStats: RevenueStats;
  topProducts?: { name: string; qty: number; revenue: number }[];
}) {
  const totalRev = revenueStats.revenue ?? 0;
  const growthRate = revenueStats.revenueTrend ?? 0;
  const totalOrders = revenueStats.orderCount ?? 0;
  const isPositive = growthRate >= 0;

  const topProductName = topProducts?.[0]?.name ?? "best-selling catalog products";

  const handleAskCopilot = () => {
    const event = new CustomEvent("open-copilot-chat", {
      detail: { initialPrompt: `Why did revenue grow ${growthRate >= 0 ? "+" : ""}${growthRate}% over the past period?` },
    });
    window.dispatchEvent(event);
  };

  return (
    <Card className="relative overflow-hidden border-(--primary)/20 bg-gradient-to-r from-(--primary)/10 via-(--primary)/5 to-background p-5 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Header Title */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--primary) text-(--primary-foreground) shadow-md shadow-(--primary)/20">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-foreground">
                Weekly Executive AI Insights
              </h3>
              <Badge variant="outline" className="border-(--primary)/30 bg-(--primary)/10 text-(--primary) text-[10px] py-0 px-2 font-medium">
                Pro Digest
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI Copilot synthesized executive performance report for the past period.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleAskCopilot}
          size="sm"
          className="gap-2 bg-(--primary) hover:bg-(--primary)/90 text-(--primary-foreground) shadow-xs shrink-0 self-start"
        >
          <Sparkles className="h-4 w-4" /> Ask Copilot Follow-up Question
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-background/80 p-3 border border-border/60">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Period Revenue</span>
          <div className="text-lg font-bold mt-0.5">৳{Math.round(totalRev).toLocaleString()}</div>
        </div>

        <div className="rounded-xl bg-background/80 p-3 border border-border/60">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sales Growth Rate</span>
          <div className={`flex items-center gap-1 text-lg font-bold mt-0.5 ${isPositive ? 'text-(--success)' : 'text-(--destructive)'}`}>
            {isPositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            {isPositive ? `+${growthRate}%` : `${growthRate}%`}
          </div>
        </div>

        <div className="rounded-xl bg-background/80 p-3 border border-border/60">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Completed Orders</span>
          <div className="text-lg font-bold mt-0.5">{totalOrders} orders</div>
        </div>
      </div>

      {/* AI Commentary & Strategic Recommendations */}
      <div className="mt-4 rounded-xl bg-(--primary)/5 p-3.5 border border-(--primary)/20 text-xs space-y-2">
        <p className="font-mono text-foreground/90 font-medium leading-relaxed">
          "Your store generated <span className="font-bold text-(--primary)">৳{Math.round(totalRev).toLocaleString()}</span> across <span className="font-bold">{totalOrders} completed orders</span> ({isPositive ? '+' : ''}{growthRate}% vs prior period). Primary demand driven by {topProductName}."
        </p>

        <div className="pt-1">
          <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block mb-1">
            🎯 Copilot Strategic Recommendations:
          </span>
          <ul className="space-y-1 text-foreground/80 pl-4 list-disc text-[11px]">
            <li>Restock top-performing inventory variants ({topProductName}) before peak chat inquiries.</li>
            <li>Promote active campaign discount codes directly in customer chat responses.</li>
            <li>Follow up with unconverted abandoned cart leads using AI automation.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
