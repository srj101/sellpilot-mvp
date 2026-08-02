/**
 * FR-INB-04 "High Traffic Mode" signal for the Inbox — reads live waiting/active counts
 * for the meta-dm-reply queue directly from Redis via @acme/queue's own getStats(), the
 * same producer/consumer pattern already used by notify-queue.ts. Platform-wide, not
 * per-business: an accurate per-business breakdown would need a dedicated Redis counter
 * (new infrastructure) for a signal that isn't tier-gated — at this launch's scale
 * (single server, ~10 clients per the cost plan), "the whole queue is busy" is a
 * reasonable proxy for "your inbox might be slower than usual right now."
 */
import { createQueue } from "@acme/queue";

const queue = createQueue();

// Fixed, not configurable — no per-business setting exists for this in the spec.
// Deliberately low: a handful of concurrent replies is already enough for individual
// response latency to start climbing at this launch's server scale.
const HIGH_TRAFFIC_THRESHOLD = 5;

export interface QueueStatus {
  waiting: number;
  active: number;
  isHighTraffic: boolean;
}

export async function getQueueStatus(): Promise<QueueStatus> {
  try {
    const { waiting, active } = await queue.getStats("meta-dm-reply");
    return { waiting, active, isHighTraffic: waiting + active >= HIGH_TRAFFIC_THRESHOLD };
  } catch (err) {
    console.error("[queue-status] Failed to read queue stats:", err);
    return { waiting: 0, active: 0, isHighTraffic: false };
  }
}
