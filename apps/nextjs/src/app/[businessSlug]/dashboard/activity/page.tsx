import { Suspense } from "react";
import ActivityClient from "./activity-client";

export const metadata = {
  title: "Activity Log | SellPilot",
  description: "View store audit trail and business activity log",
};

export default function ActivityPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading activity log...</div>}>
      <ActivityClient />
    </Suspense>
  );
}
