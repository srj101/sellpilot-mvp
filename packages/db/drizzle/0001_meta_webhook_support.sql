ALTER TABLE "meta_connection"
ADD COLUMN "facebook_page_id" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "facebook_page_name" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "facebook_page_access_token" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "instagram_business_account_id" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "instagram_username" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "whatsapp_business_account_id" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "whatsapp_phone_number_id" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "whatsapp_access_token" text;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "webhook_subscription_status" text DEFAULT 'not_configured' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "webhook_subscribed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "meta_connection"
ADD COLUMN "webhook_subscription_error" text;
--> statement-breakpoint
CREATE INDEX "meta_connection_platform_account_id_idx" ON "meta_connection" USING btree ("platform_account_id");
--> statement-breakpoint
CREATE INDEX "meta_connection_facebook_page_id_idx" ON "meta_connection" USING btree ("facebook_page_id");
--> statement-breakpoint
CREATE INDEX "meta_connection_instagram_business_account_id_idx" ON "meta_connection" USING btree ("instagram_business_account_id");
--> statement-breakpoint
CREATE INDEX "meta_connection_whatsapp_phone_number_id_idx" ON "meta_connection" USING btree ("whatsapp_phone_number_id");
--> statement-breakpoint
CREATE TABLE "meta_webhook_event" (
    "id" text PRIMARY KEY NOT NULL,
    "dedupe_key" text NOT NULL,
    "platform" text NOT NULL,
    "object" text NOT NULL,
    "event_type" text NOT NULL,
    "meta_connection_id" text,
    "user_id" text,
    "platform_account_id" text NOT NULL,
    "source_id" text,
    "raw_payload" jsonb NOT NULL,
    "headers" jsonb,
    "received_at" timestamp DEFAULT now() NOT NULL,
    "processed_at" timestamp,
    "status" text DEFAULT 'received' NOT NULL,
    "error_message" text,
    CONSTRAINT "meta_webhook_event_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "meta_webhook_event"
ADD CONSTRAINT "meta_webhook_event_meta_connection_id_meta_connection_id_fk" FOREIGN KEY ("meta_connection_id") REFERENCES "public"."meta_connection"("id") ON DELETE
set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_webhook_event"
ADD CONSTRAINT "meta_webhook_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "meta_webhook_event_platform_idx" ON "meta_webhook_event" USING btree ("platform", "platform_account_id");
--> statement-breakpoint
CREATE INDEX "meta_webhook_event_user_id_idx" ON "meta_webhook_event" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "meta_webhook_event_connection_id_idx" ON "meta_webhook_event" USING btree ("meta_connection_id");