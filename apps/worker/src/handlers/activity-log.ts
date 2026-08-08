import { db } from "@acme/db/client";
import { activityLog } from "@acme/db/schema";
import type { ActivityLogJob, Job } from "@acme/queue";

export async function handleActivityLog(job: Job<ActivityLogJob>): Promise<void> {
  const data = job.data;
  try {
    await db.insert(activityLog).values(data);
    console.log(`[ActivityLog] ${data.summary}`);
  } catch (err) {
    console.error(
      `[ActivityLog] Failed to record "${data.action}" for business ${data.businessId}:`,
      err,
    );
  }
}
