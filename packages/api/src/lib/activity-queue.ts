import { createQueue } from "@acme/queue";
import type { ActivityLogJob } from "@acme/queue";

const queue = createQueue();

export async function enqueueActivityLog(data: ActivityLogJob): Promise<void> {
  try {
    await queue.enqueue("activity-log", data);
  } catch (err) {
    // Best-effort — a failed enqueue must never break the mutation that triggered it.
    console.error("[activity-queue] Failed to enqueue activity-log:", err);
  }
}
