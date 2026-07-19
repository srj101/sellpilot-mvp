/**
 * Cleanup orphaned webhook events
 * Events without a valid userId or connection are data leaks - remove them
 */

import { db } from "@acme/db/client";
import { metaWebhookEvent, eq, isNull } from "@acme/db";

async function cleanup() {
  console.log("[Cleanup] Starting orphaned events cleanup...");

  // Delete events where userId is NULL (orphaned - no connection found)
  const orphanedResult = await db
    .delete(metaWebhookEvent)
    .where(isNull(metaWebhookEvent.userId))
    .returning();

  console.log(`[Cleanup] Deleted ${orphanedResult.length} orphaned events (no userId)`);

  // Delete events where the status is "orphaned" and older than 7 days
  const oldOrphanedResult = await db
    .delete(metaWebhookEvent)
    .where(
      eq(metaWebhookEvent.status, "orphaned")
    )
    .returning();

  console.log(`[Cleanup] Deleted ${oldOrphanedResult.length} orphaned status events`);

  console.log("[Cleanup] Done!");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("[Cleanup] Error:", err);
  process.exit(1);
});