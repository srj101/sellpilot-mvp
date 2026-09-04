/**
 * Enables the Postgres extensions and index that product search depends on.
 *
 * drizzle-kit push manages columns, not extensions or operator-class indexes, so this has
 * to run once per database alongside the schema push. It is idempotent — safe to re-run,
 * and safe to run against a database where it has already been applied.
 *
 *   pnpm --filter @acme/db search:init
 */
import { sql } from "@vercel/postgres";

async function main() {
  // Indexed fuzzy matching. Without this, product search falls back to loading every row
  // for a business into Node and comparing substrings — which is what made "Runner
  // sneaker" unable to find "Running Sneakers".
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  // Diacritic folding, so a query typed without accents still matches text that has them.
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`;

  await sql`
    CREATE INDEX IF NOT EXISTS product_search_text_trgm_idx
      ON product USING GIN (search_text gin_trgm_ops)`;

  const { rows: extensions } = await sql`
    SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent')`;
  const { rows: indexes } = await sql`
    SELECT indexname FROM pg_indexes WHERE indexname = 'product_search_text_trgm_idx'`;

  console.log(`extensions: ${extensions.map((e) => e.extname).join(", ") || "MISSING"}`);
  console.log(`index:      ${indexes[0]?.indexname ?? "MISSING"}`);
}

await main();
