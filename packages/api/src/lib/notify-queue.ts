/**
 * Enqueues the order-status-notify job (see packages/queue/src/types.ts) — consumed by
 * apps/worker/src/handlers/order-status-notify.ts, which sends one confirmation message
 * back into the customer's chat thread when COD is confirmed or online payment succeeds
 * on the /pay/[token] checkout page (checkout.ts's confirmCod/markOrderPaid).
 *
 * Uses @acme/queue's createQueue() — the same producer/consumer pattern already proven
 * by apps/nextjs's meta webhook route (producer) and apps/worker (consumer) for
 * meta-dm-reply, rather than packages/api/src/lib/queue.ts's separate raw-BullMQ setup,
 * whose actual consumption point isn't clearly wired into apps/worker.
 */
import { createQueue } from "@acme/queue";

const queue = createQueue();

export async function enqueueOrderStatusNotify(businessId: string, orderId: string): Promise<void> {
  try {
    await queue.enqueue("order-status-notify", { businessId, orderId });
  } catch (err) {
    // Best-effort — a failed enqueue must never break the checkout mutation that
    // triggered it (the order/payment itself already succeeded by this point).
    console.error("[notify-queue] Failed to enqueue order-status-notify:", err);
  }
}
