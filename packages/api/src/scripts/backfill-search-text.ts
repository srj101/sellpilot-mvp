/**
 * Populates product.searchKeywords and product.searchText for products that predate them.
 *
 * Every product write now maintains both (see product-search-text.ts), so this only has to
 * cover rows created before that existed. Resumable and idempotent: it skips anything
 * already populated, so it can be re-run after a partial run or a rate-limit without
 * regenerating — and paying for — keywords that already exist.
 *
 *   pnpm --filter @acme/api search:backfill
 *   pnpm --filter @acme/api search:backfill -- --force     # regenerate, overwriting
 *                                                            # merchant-edited keywords
 *   pnpm --filter @acme/api search:backfill -- --dry-run   # show what would change
 */
import { asc, eq, isNull, or } from "@acme/db";
import { db } from "@acme/db/client";
import { product } from "@acme/db/schema";

import { generateProductKeywords, rebuildProductSearchText } from "../lib/product-search-text";

const BATCH_SIZE = 25;
/** Serial, with a gap. A backfill is never urgent, and hammering the completions endpoint
 * to save two minutes risks a rate-limit that costs far more than the wait. */
const DELAY_BETWEEN_CALLS_MS = 300;

const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const rows = await db
    .select({
      id: product.id,
      businessId: product.businessId,
      title: product.title,
      description: product.description,
      category: product.category,
      gender: product.gender,
      searchKeywords: product.searchKeywords,
    })
    .from(product)
    .where(force ? undefined : or(isNull(product.searchKeywords), isNull(product.searchText)))
    .orderBy(asc(product.createdAt));

  if (rows.length === 0) {
    console.log("Nothing to backfill — every product already has keywords and search text.");
    return;
  }

  console.log(`${rows.length} product(s) to process${dryRun ? " (dry run)" : ""}\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    const label = `[${index + 1}/${rows.length}] ${row.title}`;

    // A merchant's own keywords always win, because they were typed by someone who knows
    // what their customers search for. --force is the deliberate override, for when the
    // generator itself has changed and every product needs redoing.
    if (row.searchKeywords?.trim() && !force) {
      if (!dryRun) await rebuildProductSearchText(db, row.id);
      console.log(`${label}\n   kept existing keywords: ${row.searchKeywords}\n`);
      skipped++;
      continue;
    }

    const keywords = await generateProductKeywords({
      title: row.title,
      description: row.description,
      category: row.category,
      gender: row.gender,
    });

    if (!keywords) {
      console.log(`${label}\n   FAILED to generate — product stays searchable by title/description\n`);
      failed++;
      continue;
    }

    console.log(`${label}\n   ${keywords}\n`);
    generated++;

    if (!dryRun) {
      await db.update(product).set({ searchKeywords: keywords }).where(eq(product.id, row.id));
      await rebuildProductSearchText(db, row.id);
    }

    if ((index + 1) % BATCH_SIZE === 0) console.log(`--- ${index + 1} done ---\n`);
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  console.log(`\nGenerated ${generated}, kept ${skipped}, failed ${failed}.`);
  if (dryRun) console.log("Dry run — nothing was written.");
}

await main();
