import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { AnalyticsClient } from "./_components/analytics-client";

const VALID_RANGES = ["7d", "30d", "90d", "1y", "custom"] as const;
type Range = (typeof VALID_RANGES)[number];

/** Zeroed summary rendered for Starter (analytics tier "none") so the page soft-locks
 * instead of the server-side FORBIDDEN from getSummary crashing SSR. Mirrors the real
 * getSummary shape; trend fields null so no trend badge renders. */
const EMPTY_SUMMARY: {
  chatOrderSeries: { label: string; sessions: number; orders: number }[];
  messagingStats: {
    messagesSent: number;
    messagesSentTrend: number | null;
    chatSessions: number;
    chatSessionsTrend: number | null;
    conversionRate: number;
    conversionRateTrend: number | null;
  };
  weeklyInquiries: { total: number; days: { label: string; count: number }[] };
  topProducts: { name: string; qty: number; revenue: number }[];
  customersByCity: { city: string; count: number; pct: number }[];
  revenueStats: {
    revenue: number;
    revenueTrend: number | null;
    orderCount: number;
    orderCountTrend: number | null;
    aov: number;
    aovTrend: number | null;
    returnRate: number;
    returnRateTrend: number | null;
  };
  revenueSeries: { label: string; revenue: number }[];
} = {
  chatOrderSeries: [],
  messagingStats: {
    messagesSent: 0,
    messagesSentTrend: null,
    chatSessions: 0,
    chatSessionsTrend: null,
    conversionRate: 0,
    conversionRateTrend: null,
  },
  weeklyInquiries: { total: 0, days: [] },
  topProducts: [],
  customersByCity: [],
  revenueStats: {
    revenue: 0,
    revenueTrend: null,
    orderCount: 0,
    orderCountTrend: null,
    aov: 0,
    aovTrend: null,
    returnRate: 0,
    returnRateTrend: null,
  },
  revenueSeries: [],
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { range: rawRange, from, to } = await searchParams;
  const isCustom = Boolean(from && to);
  const range: Range = isCustom ? "custom" : VALID_RANGES.includes(rawRange as Range) ? (rawRange as Range) : "30d";

  const caller = await createCaller(await headers());
  const [tier, copilotTier] = await Promise.all([
    caller.analytics.getAccessTier(),
    caller.analytics.getCopilotAccess(),
  ]);
  const summary = tier === "none" ? EMPTY_SUMMARY : await caller.analytics.getSummary({ range, from, to });

  return (
      <AnalyticsClient range={range} from={from ?? null} to={to ?? null} tier={tier} copilotTier={copilotTier} {...summary} />
  );
}
