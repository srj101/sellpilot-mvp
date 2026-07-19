/**
 * Fresh start cleanup - removes ALL conversations, integrations, and webhook events
 * WARNING: This deletes ALL data - only run on a development/staging database
 */

import { db } from "../src/client";
import { metaConnection, metaWebhookEvent } from "../src/schema";

async function freshStart() {
  console.log("⚠️  FRESH START CLEANUP - This will delete ALL data!");
  console.log("Tables to clear:");
  console.log("  - metaWebhookEvent (all webhook events)");
  console.log("  - metaConnection (all Meta integrations)");
  console.log("");

  const args = process.argv.slice(2);
  if (!args.includes("--confirm")) {
    console.log("Usage: npx tsx packages/db/scripts/fresh-start-cleanup.ts --confirm");
    console.log("Add --dry-run to see what would be deleted without actually deleting.");
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");

  if (dryRun) {
    console.log("🔍 DRY RUN - No data will be deleted\n");
  }

  try {
    // Count records
    const [eventCount, connCount] = await Promise.all([
      db.select().from(metaWebhookEvent).limit(1000),
      db.select().from(metaConnection).limit(1000),
    ]);

    console.log(`Found:`);
    console.log(`  - ${eventCount.length}+ webhook events`);
    console.log(`  - ${connCount.length}+ Meta connections`);
    console.log("");

    if (dryRun) {
      console.log("Dry run complete - no data deleted.");
      return;
    }

    // Delete in order (respecting foreign keys)
    console.log("Deleting webhook events...");
    await db.delete(metaWebhookEvent);
    console.log("  ✓ Deleted webhook events");

    console.log("Deleting Meta connections...");
    await db.delete(metaConnection);
    console.log("  ✓ Deleted Meta connections");

    console.log("\n✅ Fresh start complete! All conversations and integrations deleted.");
    console.log("Each client will now have isolated data with their own connections.");

  } catch (err) {
    console.error("❌ Error during cleanup:", err);
    process.exit(1);
  }

  process.exit(0);
}

freshStart();