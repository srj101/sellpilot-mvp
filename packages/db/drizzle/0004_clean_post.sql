CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_role" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_role_user_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "value" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'client';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint
ALTER TABLE "meta_webhook_event" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_role" ADD CONSTRAINT "custom_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_userId_idx" ON "role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_role_user_id_idx" ON "custom_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meta_webhook_event_thread_idx" ON "meta_webhook_event" USING btree ("user_id","thread_id");