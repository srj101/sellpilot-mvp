import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { business, user } from "./auth-schema";

/**
 * A merchant telling us something is broken.
 *
 * The existing Support page is for the merchant's own customers — tickets flagged out of
 * their Inbox. There was no path at all for a merchant to reach us, so a broken import or
 * a bot saying the wrong thing reached us only if they happened to message someone.
 *
 * The columns that matter are the ones nobody types. Looking back at real bugs — a contact
 * showing as "Contact 2731…8960", a CSV import rejecting every row, a blank KPI panel, the
 * agent refusing an order it had just quoted — what was missing every time was context:
 * which page, which business, and above all which conversation. "The bot is not working
 * properly" is unactionable; the same sentence with a threadId attached is a five-minute
 * fix. So the client captures all of it and the merchant just describes what happened.
 */
export const bugReport = pgTable(
  "bug_report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    /** Whoever hit the bug — deliberately not restricted to the owner, since the person
     * who runs into a broken screen is usually staff. */
    reportedByUserId: text("reported_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),

    /** ai_replies | orders | products | payments | channels | other */
    category: text("category").notNull(),
    /** blocking | annoying | suggestion — phrased for merchants, not as P1/P2/P3, because
     * nobody outside engineering knows what those mean. */
    severity: text("severity").notNull(),
    /** What the merchant actually wrote. */
    description: text("description").notNull(),

    // --- captured, never typed -------------------------------------------------------

    /** Dashboard path they were on when they reported. */
    pageUrl: text("page_url"),
    /**
     * The conversation, when reported from the Inbox. Its own column rather than part of
     * the context blob because this is the field that actually gets queried: most reports
     * are about something the agent said, and this is the only way to find which
     * something.
     */
    threadId: text("thread_id"),
    /**
     * S3 key, under its own bug-reports/ prefix rather than mixed in with product images.
     *
     * These screenshots routinely contain the merchant's CUSTOMERS' names, phone numbers
     * and delivery addresses — people who never signed up with us. Keeping them in one
     * prefix means they can be purged wholesale without touching anything else.
     */
    screenshotS3Key: text("screenshot_s3_key"),

    planKey: text("plan_key"),
    userRole: text("user_role"),
    userAgent: text("user_agent"),
    viewport: text("viewport"),
    /** Last few client-side console errors, scrubbed of anything token-shaped before it
     * ever leaves the browser (see apps/nextjs/src/lib/bug-context.ts). */
    consoleErrors: jsonb("console_errors").$type<string[]>(),

    // --- triage ----------------------------------------------------------------------

    /** open | seen | fixed | wont_fix */
    status: text("status").notNull().default("open"),
    /** Written back to the merchant, so a report isn't a message into the void. */
    adminNote: text("admin_note"),
    resolvedAt: timestamp("resolved_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The merchant's own list of what they've reported.
    index("bug_report_business_id_idx").on(table.businessId),
    // The triage queue: everything still open, worst first.
    index("bug_report_status_idx").on(table.status, table.severity),
  ],
);
