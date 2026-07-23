ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'client';--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "custom_role_key" text;