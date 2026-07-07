import { sql } from "@vercel/postgres";

async function main() {
  console.log("Running manual migration to add is_read column...");
  try {
    // Add is_read column if it doesn't exist
    await sql`
      ALTER TABLE "meta_webhook_event"
      ADD COLUMN IF NOT EXISTS "is_read" boolean NOT NULL DEFAULT false;
    `;
    console.log("✓ Added is_read column to meta_webhook_event");

    // Add unique constraint on meta_connection if not exists
    // Check first if the constraint already exists
    const constraintCheck = await sql`
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'meta_connection_user_platform_account'
      AND table_name = 'meta_connection';
    `;
    
    if (constraintCheck.rows.length === 0) {
      try {
        await sql`
          ALTER TABLE "meta_connection"
          ADD CONSTRAINT "meta_connection_user_platform_account"
          UNIQUE ("user_id", "platform", "platform_account_id");
        `;
        console.log("✓ Added unique constraint meta_connection_user_platform_account");
      } catch (err) {
        console.log("⚠ Unique constraint already exists or failed (non-fatal):", err.message);
      }
    } else {
      console.log("✓ Unique constraint meta_connection_user_platform_account already exists");
    }

    console.log("Manual migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

void main();
