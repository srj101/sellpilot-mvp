import { redirect } from "next/navigation";

import { AccessAudit } from "../_components/access-audit";
import { HealthOverview } from "../_components/health-overview";
import { PlatformEconomics } from "../_components/platform-economics";
import { PlatformOverview } from "../_components/platform-overview";
import { StoresDirectory } from "../_components/stores-directory";
import { SupportOverview } from "../_components/support-overview";
import { TodayQueue } from "../_components/today-queue";

export default async function SuperadminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  // Legacy route redirections to consolidated hubs
  if (section === "ai" || section === "queues" || section === "channels") {
    redirect("/superadmin/health");
  }
  if (section === "bugs" || section === "broadcasts") {
    redirect("/superadmin/support");
  }
  if (section === "users" || section === "audit") {
    redirect("/superadmin/access");
  }
  if (section === "payments") {
    redirect("/superadmin/today");
  }

  switch (section) {
    case "today":
      return <TodayQueue />;
    case "overview":
      return <PlatformOverview />;
    case "economics":
      return <PlatformEconomics />;
    case "stores":
      return <StoresDirectory />;
    case "health":
      return <HealthOverview />;
    case "support":
      return <SupportOverview />;
    case "access":
      return <AccessAudit />;
    default:
      redirect("/superadmin/today");
  }
}
