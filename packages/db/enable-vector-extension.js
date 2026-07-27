import { sql } from "@vercel/postgres";

// One-time setup: the `vector` column type used by product_image_embedding (see
// src/product-schema.ts) needs Postgres's pgvector extension enabled first —
// `drizzle-kit push` creates tables/columns but never extensions. Run this once per
// database (dev and production) before `pnpm --filter @acme/db push`. Neon (the Postgres
// host behind @vercel/postgres here) supports this extension out of the box.
async function main() {
  console.log("Enabling pgvector extension...");
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    console.log("pgvector extension is enabled.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to enable pgvector extension:", error);
    process.exit(1);
  }
}

void main();
