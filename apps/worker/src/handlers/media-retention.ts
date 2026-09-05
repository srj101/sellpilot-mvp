/**
 * Deletes conversation media past each business's plan retention window.
 *
 * Without this the storage figure only ever climbs. Now that customer photos, voice notes
 * and avatars are all archived and counted, an active shop would reach its plan ceiling
 * and stay there — with no way back other than upgrading, for files nobody will ever open
 * again. PLAN_CATALOG has carried conversationRetentionDays all along (Starter 30, Growth
 * 182, Pro 548); nothing applied it to media until now.
 *
 * It is also what keeps holding customers' voice recordings and photographs defensible.
 * People who never signed up with us are in those files, and "we keep them forever" is
 * not an answer.
 */
import { db } from "@acme/db/client";
import { subscription } from "@acme/db/schema";
import { pruneExpiredMedia } from "@acme/api/media-storage";
import type { PlanKey } from "@acme/api/plans";

/** Per business, per run. Bounded so one very old account cannot monopolise a sweep and
 * starve every other business of its own cleanup. */
const PER_BUSINESS_LIMIT = 200;

export async function runMediaRetentionSweep(): Promise<void> {
  const businesses = await db
    .select({ businessId: subscription.businessId, plan: subscription.plan })
    .from(subscription);

  let totalDeleted = 0;
  let totalBytes = 0;

  for (const row of businesses) {
    if (!row.businessId) continue;
    try {
      const { deleted, bytesFreed } = await pruneExpiredMedia(
        db,
        row.businessId,
        (row.plan as PlanKey | null) ?? "starter",
        PER_BUSINESS_LIMIT,
      );
      totalDeleted += deleted;
      totalBytes += bytesFreed;
    } catch (err) {
      // One business's failure must not stop everyone else's cleanup — that is how a
      // single bad row turns into every merchant's quota filling up.
      console.error(`[media-retention] Sweep failed for ${row.businessId}:`, err);
    }
  }

  if (totalDeleted > 0) {
    console.log(
      `[media-retention] Deleted ${totalDeleted} file(s), freed ${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
    );
  }
}
