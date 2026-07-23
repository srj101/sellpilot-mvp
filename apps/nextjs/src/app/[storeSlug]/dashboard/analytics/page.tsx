import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { AnalyticsClient } from "./_components/analytics-client";

const VALID_RANGES = ["7d", "30d", "90d", "1y", "custom"] as const;
type Range = (typeof VALID_RANGES)[number];

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
  const summary = await caller.analytics.getSummary({ range, from, to });

  return (
    <DashboardShell>
      <AnalyticsClient range={range} from={from ?? null} to={to ?? null} {...summary} />
    </DashboardShell>
  );
}
