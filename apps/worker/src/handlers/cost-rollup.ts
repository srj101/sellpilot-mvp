/**
 * The nightly cost sweep: meter what storage cost yesterday, then roll the raw ledger up.
 *
 * Two jobs in one pass because they are the same pass. Storage is the cost that has no
 * event to hang off — a file sitting in S3 costs money every day it stays there, not once
 * when it was written — so somebody has to walk the businesses and price what they are
 * holding. Having done that walk, rolling the day up costs one more query.
 *
 * The rollup exists because the dashboard must never read platform_cost_event directly. At
 * the message volume this product is built for, one row per model call means a 90-day cost
 * chart scans millions of rows, and that is the kind of slow that only appears in
 * production months after the code shipped.
 */
import { and, gte, lt, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { platformCostDaily, platformCostEvent, subscription } from "@acme/db/schema";
import { recordDailyStorageCost } from "@acme/api/platform-cost";

/** Midnight UTC of the day that just ended. */
function yesterdayUtc(): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Midnight UTC of the day a given instant falls in, through the following midnight. */
function utcDayOf(at: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Price one day of every business's stored bytes.
 *
 * Reads subscription.storageUsedBytes rather than summing conversation_media, because that
 * counter is what the merchant is actually charged against and what the billing page
 * shows — costing a different number than the one the product enforces would produce two
 * storage figures that never reconcile.
 */
async function meterStorage(day: Date): Promise<number> {
  const rows = await db
    .select({
      businessId: subscription.businessId,
      bytes: subscription.storageUsedBytes,
    })
    .from(subscription);

  let metered = 0;
  for (const row of rows) {
    if (!row.businessId || row.bytes <= 0) continue;
    try {
      await recordDailyStorageCost({
        db,
        businessId: row.businessId,
        bytesStored: row.bytes,
        day,
      });
      metered++;
    } catch (err) {
      // One business's failure must not stop the rest being metered.
      console.error(`[cost-rollup] Storage metering failed for ${row.businessId}:`, err);
    }
  }
  return metered;
}

/**
 * Collapse one day of raw events into platform_cost_daily.
 *
 * The grouping happens in SQL — a busy day is a lot of raw rows, and none of them need to
 * travel over the wire to be summed — but the aggregated result comes back into the worker
 * and is written with an ordinary insert, not a single INSERT...SELECT. Drizzle's
 * `.insert(table).select(subquery)` requires the subquery's selected columns to line up
 * with the target table's declared column order exactly, silently including the
 * auto-generated ones (id, createdAt) that this query never meant to supply — it rejected
 * every shape tried here with "selected fields are not the same or are in a different order
 * compared to the table definition." A handful of grouped buckets a day is not a volume
 * that needs a single-statement optimization badly enough to fight that.
 *
 * The conflict clause makes a re-run idempotent. Re-running a day must overwrite that day's
 * buckets, never add to them — otherwise a retry silently doubles the cost history, and a
 * doubled cost figure is indistinguishable from a real one.
 */
async function rollUpDay(start: Date, end: Date): Promise<number> {
  const grouped = await db
    .select({
      businessId: platformCostEvent.businessId,
      service: platformCostEvent.service,
      sku: platformCostEvent.sku,
      source: platformCostEvent.source,
      quantity: sql<number>`sum(${platformCostEvent.quantity})::bigint`,
      costMicroUsd: sql<number>`sum(${platformCostEvent.costMicroUsd})::bigint`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(platformCostEvent)
    .where(
      and(
        gte(platformCostEvent.occurredAt, start),
        lt(platformCostEvent.occurredAt, end),
      ),
    )
    .groupBy(
      platformCostEvent.businessId,
      platformCostEvent.service,
      platformCostEvent.sku,
      platformCostEvent.source,
    );

  if (grouped.length === 0) return 0;

  await db
    .insert(platformCostDaily)
    .values(
      grouped.map((row) => ({
        businessId: row.businessId,
        day: start,
        service: row.service,
        sku: row.sku,
        source: row.source,
        quantity: Number(row.quantity),
        costMicroUsd: Number(row.costMicroUsd),
        eventCount: row.eventCount,
      })),
    )
    .onConflictDoUpdate({
      target: [
        platformCostDaily.businessId,
        platformCostDaily.day,
        platformCostDaily.service,
        platformCostDaily.sku,
        platformCostDaily.source,
      ],
      set: {
        quantity: sql`excluded.quantity`,
        costMicroUsd: sql`excluded.cost_micro_usd`,
        eventCount: sql`excluded.event_count`,
      },
    });

  return grouped.length;
}

/**
 * @param forDay Roll up the UTC day this instant falls in, instead of yesterday. For an
 * on-demand re-check (a superadmin wants to see today's activity now, not after the next
 * nightly run) — the nightly cron never passes this, and always gets yesterday's completed
 * day. Idempotent either way: rollUpDay's onConflictDoUpdate means running today's partial
 * day now and letting the nightly job overwrite it with the completed totals tomorrow is
 * safe, not a double-count.
 */
export async function runCostRollup(forDay?: Date): Promise<void> {
  const { start, end } = forDay ? utcDayOf(forDay) : yesterdayUtc();

  // Storage first: it writes events dated to that day, so the rollup below must run after
  // it or the day's storage cost lands in the ledger but not in the summary the dashboard
  // reads — the figures would then disagree with each other for exactly one day.
  const metered = await meterStorage(start);
  const buckets = await rollUpDay(start, end);

  console.log(
    `[cost-rollup] ${start.toISOString().slice(0, 10)}: ` +
      `metered storage for ${metered} business(es), rolled up ${buckets} bucket(s)`,
  );
}
