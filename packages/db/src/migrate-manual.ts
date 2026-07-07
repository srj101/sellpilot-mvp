import { sql } from "drizzle-orm";
import { db } from "./client";

async function main() {
  console.log("Running manual migrations...");
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "product" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "images" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "product_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action
      );
    `);
    console.log("Created table: product");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "product_variant" (
        "id" text PRIMARY KEY NOT NULL,
        "product_id" text NOT NULL,
        "title" text NOT NULL,
        "option1" text,
        "option2" text,
        "option3" text,
        "price" integer DEFAULT 0 NOT NULL,
        "compare_at_price" integer,
        "sku" text,
        "inventory_quantity" integer DEFAULT 0 NOT NULL,
        "image_url" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "product_variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE cascade ON UPDATE no action
      );
    `);
    console.log("Created table: product_variant");

    console.log("Manual migrations completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

void main();
