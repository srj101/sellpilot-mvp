ALTER TABLE "role" DROP CONSTRAINT "role_userId_key_unique";--> statement-breakpoint
ALTER TABLE "meta_connection" DROP CONSTRAINT "meta_connection_user_platform_account";--> statement-breakpoint
ALTER TABLE "agent_session" DROP CONSTRAINT "agent_session_thread_unique";--> statement-breakpoint
ALTER TABLE "business_profile" DROP CONSTRAINT "business_profile_user_unique";--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT "customer_user_phone_unique";--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT "customer_user_email_unique";--> statement-breakpoint
ALTER TABLE "order" DROP CONSTRAINT "order_user_order_number_unique";--> statement-breakpoint
ALTER TABLE "policy" DROP CONSTRAINT "policy_user_type_unique";--> statement-breakpoint
ALTER TABLE "shipping_rate" DROP CONSTRAINT "shipping_rate_user_district_unique";--> statement-breakpoint
ALTER TABLE "conversation_meta" DROP CONSTRAINT "conversation_meta_user_thread_unique";--> statement-breakpoint
ALTER TABLE "tag" DROP CONSTRAINT "tag_user_label_unique";--> statement-breakpoint
DROP INDEX "role_userId_idx";--> statement-breakpoint
DROP INDEX "meta_connection_user_id_idx";--> statement-breakpoint
DROP INDEX "agent_session_user_id_idx";--> statement-breakpoint
DROP INDEX "customer_user_id_idx";--> statement-breakpoint
DROP INDEX "faq_user_id_idx";--> statement-breakpoint
DROP INDEX "offer_user_id_idx";--> statement-breakpoint
DROP INDEX "order_user_id_idx";--> statement-breakpoint
DROP INDEX "policy_user_id_idx";--> statement-breakpoint
DROP INDEX "shipping_rate_user_id_idx";--> statement-breakpoint
DROP INDEX "page_view_user_id_idx";--> statement-breakpoint
DROP INDEX "conversation_meta_user_id_idx";--> statement-breakpoint
DROP INDEX "customer_note_user_id_idx";--> statement-breakpoint
DROP INDEX "tag_user_id_idx";--> statement-breakpoint
DROP INDEX "meta_connection_platform_idx";--> statement-breakpoint
DROP INDEX "meta_webhook_event_thread_idx";--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_connection" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_webhook_event" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profile" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "faq" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "policy" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rate" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "page_view" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_meta" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_note" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tag" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connection" ADD CONSTRAINT "meta_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_webhook_event" ADD CONSTRAINT "meta_webhook_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profile" ADD CONSTRAINT "business_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq" ADD CONSTRAINT "faq_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rate" ADD CONSTRAINT "shipping_rate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_view" ADD CONSTRAINT "page_view_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_meta" ADD CONSTRAINT "conversation_meta_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_org_id_idx" ON "role" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meta_connection_org_id_idx" ON "meta_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meta_webhook_event_org_id_idx" ON "meta_webhook_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_session_org_id_idx" ON "agent_session" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_org_id_idx" ON "customer" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "faq_org_id_idx" ON "faq" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "offer_org_id_idx" ON "offer" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "order_org_id_idx" ON "order" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policy_org_id_idx" ON "policy" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shipping_rate_org_id_idx" ON "shipping_rate" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "page_view_org_id_idx" ON "page_view" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversation_meta_org_id_idx" ON "conversation_meta" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_note_org_id_idx" ON "customer_note" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tag_org_id_idx" ON "tag" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meta_connection_platform_idx" ON "meta_connection" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE INDEX "meta_webhook_event_thread_idx" ON "meta_webhook_event" USING btree ("organization_id","thread_id");--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_org_key_unique" UNIQUE("organization_id","key");--> statement-breakpoint
ALTER TABLE "meta_connection" ADD CONSTRAINT "meta_connection_org_platform_account" UNIQUE("organization_id","platform","platform_account_id");--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_org_thread_unique" UNIQUE("organization_id","thread_id");--> statement-breakpoint
ALTER TABLE "business_profile" ADD CONSTRAINT "business_profile_org_unique" UNIQUE("organization_id");--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_org_phone_unique" UNIQUE("organization_id","phone");--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_org_email_unique" UNIQUE("organization_id","email");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_org_order_number_unique" UNIQUE("organization_id","order_number");--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_org_type_unique" UNIQUE("organization_id","type");--> statement-breakpoint
ALTER TABLE "shipping_rate" ADD CONSTRAINT "shipping_rate_org_district_unique" UNIQUE("organization_id","district");--> statement-breakpoint
ALTER TABLE "conversation_meta" ADD CONSTRAINT "conversation_meta_org_thread_unique" UNIQUE("organization_id","thread_id");--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_org_label_unique" UNIQUE("organization_id","label");