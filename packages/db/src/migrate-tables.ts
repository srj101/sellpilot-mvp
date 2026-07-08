import { sql } from "@vercel/postgres";

async function main() {
  console.log("=== Checking existing tables ===");
  const { rows } = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
  console.log("Existing tables:", rows.map(r => r.table_name));

  // Create missing tables
  const missingTables = [
    {
      name: "business_profile",
      ddl: `CREATE TABLE IF NOT EXISTS "business_profile" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "description" text,
        "logo_url" text,
        "currency" text NOT NULL DEFAULT 'USD',
        "default_shipping_cost" integer NOT NULL DEFAULT 0,
        "support_email" text,
        "support_phone" text,
        "metadata" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "business_profile_user_unique" UNIQUE("user_id")
      )`
    },
    {
      name: "offer",
      ddl: `CREATE TABLE IF NOT EXISTS "offer" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "title" text NOT NULL,
        "code" text,
        "description" text,
        "type" text NOT NULL DEFAULT 'percentage',
        "value" integer NOT NULL,
        "min_subtotal" integer NOT NULL DEFAULT 0,
        "start_date" timestamp NOT NULL DEFAULT now(),
        "end_date" timestamp,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )`
    },
    {
      name: "customer",
      ddl: `CREATE TABLE IF NOT EXISTS "customer" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "phone" text,
        "email" text,
        "address" text,
        "district" text,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "customer_user_phone_unique" UNIQUE("user_id", "phone"),
        CONSTRAINT "customer_user_email_unique" UNIQUE("user_id", "email")
      )`
    },
    {
      name: "order",
      ddl: `CREATE TABLE IF NOT EXISTS "order" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "customer_id" text REFERENCES "customer"("id") ON DELETE SET NULL,
        "order_number" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "subtotal" integer NOT NULL DEFAULT 0,
        "shipping_cost" integer NOT NULL DEFAULT 0,
        "discount_amount" integer NOT NULL DEFAULT 0,
        "total" integer NOT NULL DEFAULT 0,
        "customer_name" text NOT NULL,
        "customer_phone" text,
        "customer_email" text,
        "shipping_address" text,
        "shipping_district" text,
        "coupon_code" text,
        "channel" text,
        "thread_id" text,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "order_user_order_number_unique" UNIQUE("user_id", "order_number")
      )`
    },
    {
      name: "order_item",
      ddl: `CREATE TABLE IF NOT EXISTS "order_item" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" text NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
        "product_id" text REFERENCES "product"("id") ON DELETE SET NULL,
        "variant_id" text REFERENCES "product_variant"("id") ON DELETE SET NULL,
        "name" text NOT NULL,
        "variant_title" text,
        "sku" text,
        "qty" integer NOT NULL DEFAULT 1,
        "unit_price" integer NOT NULL,
        "line_total" integer NOT NULL,
        "image_url" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      )`
    },
    {
      name: "faq",
      ddl: `CREATE TABLE IF NOT EXISTS "faq" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "question" text NOT NULL,
        "answer" text NOT NULL,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )`
    },
    {
      name: "policy",
      ddl: `CREATE TABLE IF NOT EXISTS "policy" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "policy_user_type_unique" UNIQUE("user_id", "type")
      )`
    },
    {
      name: "shipping_rate",
      ddl: `CREATE TABLE IF NOT EXISTS "shipping_rate" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "district" text NOT NULL,
        "cost" integer NOT NULL DEFAULT 0,
        "estimated_days" integer,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "shipping_rate_user_district_unique" UNIQUE("user_id", "district")
      )`
    },
    {
      name: "agent_session",
      ddl: `CREATE TABLE IF NOT EXISTS "agent_session" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "channel" text NOT NULL,
        "thread_id" text NOT NULL,
        "sender_id" text,
        "state" jsonb NOT NULL DEFAULT '{}',
        "last_message_at" timestamp NOT NULL DEFAULT now(),
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "agent_session_thread_unique" UNIQUE("user_id", "thread_id")
      )`
    }
  ];

  for (const table of missingTables) {
    const exists = rows.some(r => r.table_name === table.name);
    if (exists) {
      console.log(`Table "${table.name}" already exists, skipping.`);
    } else {
      console.log(`Creating table "${table.name}"...`);
      await sql.query(table.ddl);
      console.log(`  ✓ Created "${table.name}"`);
    }
  }

  // Create indexes (IF NOT EXISTS)
  const indexes = [
    `CREATE INDEX IF NOT EXISTS "offer_user_id_idx" ON "offer" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "customer_user_id_idx" ON "customer" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "order_user_id_idx" ON "order" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "order_customer_id_idx" ON "order" USING btree ("customer_id")`,
    `CREATE INDEX IF NOT EXISTS "order_thread_id_idx" ON "order" USING btree ("thread_id")`,
    `CREATE INDEX IF NOT EXISTS "order_item_order_id_idx" ON "order_item" USING btree ("order_id")`,
    `CREATE INDEX IF NOT EXISTS "order_item_variant_id_idx" ON "order_item" USING btree ("variant_id")`,
    `CREATE INDEX IF NOT EXISTS "faq_user_id_idx" ON "faq" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "policy_user_id_idx" ON "policy" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "shipping_rate_user_id_idx" ON "shipping_rate" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "agent_session_user_id_idx" ON "agent_session" USING btree ("user_id")`,
  ];

  console.log("\nCreating indexes...");
  for (const idx of indexes) {
    await sql.query(idx);
  }
  console.log("✓ All indexes created.");

  // Verify
  const { rows: finalRows } = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
  console.log("\nFinal tables:", finalRows.map(r => r.table_name));
  console.log("\n=== MIGRATION COMPLETE ===");
  process.exit(0);
}

void main();
