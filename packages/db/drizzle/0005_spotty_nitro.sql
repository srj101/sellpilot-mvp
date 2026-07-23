CREATE TABLE "conversation_meta" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"assigned_member_id" text,
	"summary" text,
	"summary_generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_meta_user_thread_unique" UNIQUE("user_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "customer_note" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"author_label" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tag_customer_tag_unique" UNIQUE("customer_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_user_label_unique" UNIQUE("user_id","label")
);
--> statement-breakpoint
ALTER TABLE "meta_webhook_event" ADD COLUMN "sent_by" text;--> statement-breakpoint
ALTER TABLE "conversation_meta" ADD CONSTRAINT "conversation_meta_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag" ADD CONSTRAINT "customer_tag_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag" ADD CONSTRAINT "customer_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_meta_user_id_idx" ON "conversation_meta" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_note_customer_id_idx" ON "customer_note" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_note_user_id_idx" ON "customer_note" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_tag_customer_id_idx" ON "customer_tag" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_tag_tag_id_idx" ON "customer_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tag_user_id_idx" ON "tag" USING btree ("user_id");