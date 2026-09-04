import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, desc, eq } from "@acme/db";
import { bugReport, business, notification, user } from "@acme/db/schema";

import { getPresignedUploadUrl, getPublicUrl } from "../lib/s3";
import { getPlanChannels } from "../lib/plan-limits";
import { businessScopedProcedure, superadminProcedure } from "../trpc";

const CATEGORIES = ["ai_replies", "orders", "products", "payments", "channels", "other"] as const;
const SEVERITIES = ["blocking", "annoying", "suggestion"] as const;
const STATUSES = ["open", "seen", "fixed", "wont_fix"] as const;

/** Blocking first, then oldest — the merchant who cannot work has already waited longest. */
const SEVERITY_RANK: Record<string, number> = { blocking: 0, annoying: 1, suggestion: 2 };

export const bugReportsRouter = {
  /**
   * File a report.
   *
   * businessScopedProcedure, not ownerOnlyProcedure: the person who runs into a broken
   * screen is usually staff, and making them find the owner first is how bugs go
   * unreported.
   */
  create: businessScopedProcedure
    .input(
      z.object({
        category: z.enum(CATEGORIES),
        severity: z.enum(SEVERITIES),
        description: z.string().min(5).max(4000),
        pageUrl: z.string().max(500).optional(),
        threadId: z.string().max(200).optional(),
        screenshotS3Key: z.string().max(500).optional(),
        userAgent: z.string().max(500).optional(),
        viewport: z.string().max(50).optional(),
        consoleErrors: z.array(z.string().max(1000)).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Resolved server-side, not taken from the client: the plan and the reporter's role
      // decide how this gets triaged, and neither is something a browser should assert.
      const { plan } = await getPlanChannels(ctx);

      const [created] = await ctx.db
        .insert(bugReport)
        .values({
          businessId: ctx.businessId,
          reportedByUserId: ctx.session.user.id,
          category: input.category,
          severity: input.severity,
          description: input.description,
          pageUrl: input.pageUrl,
          threadId: input.threadId,
          screenshotS3Key: input.screenshotS3Key,
          // Captured server-side rather than trusted from the client — the plan and role
          // decide how urgent this is, and neither should be something the browser asserts.
          planKey: plan,
          userRole: ctx.customRoleKey ?? ctx.memberRole ?? null,
          userAgent: input.userAgent,
          viewport: input.viewport,
          consoleErrors: input.consoleErrors,
        })
        .returning();

      if (!created) throw new Error("Failed to save the report.");

      // In-app rather than email: SES is still sandboxed, so an email would silently go
      // nowhere. The merchant sees this in their own bell; the superadmin queue is the
      // real destination.
      await ctx.db.insert(notification).values({
        businessId: ctx.businessId,
        type: "bug_report_received",
        title: "We got your report",
        body: "Thanks — we'll look into it. You can follow its status on the Report a Problem page.",
        link: "/dashboard/report",
      });

      return { id: created.id };
    }),

  /** The reporter's own history, so a report isn't a message into the void. */
  listMine: businessScopedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(bugReport)
      .where(eq(bugReport.businessId, ctx.businessId))
      .orderBy(desc(bugReport.createdAt))
      .limit(50);

    return rows.map((r) => ({
      ...r,
      screenshotUrl: r.screenshotS3Key ? getPublicUrl(r.screenshotS3Key) : null,
    }));
  }),

  /**
   * Presigned upload for one screenshot.
   *
   * Its own bug-reports/ prefix, deliberately: these images routinely contain the
   * merchant's CUSTOMERS' names, phone numbers and delivery addresses — people who never
   * signed up with us — so they need to be separable from product media and purgeable in
   * one sweep.
   *
   * No assertPlanLimit("storage") here, unlike product images. Charging a merchant's
   * storage quota for reporting our bug is backwards.
   */
  getScreenshotUploadUrl: businessScopedProcedure
    .input(z.object({ contentType: z.string().regex(/^image\/(png|jpe?g|webp)$/) }))
    .mutation(async ({ ctx, input }) => {
      const ext = input.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const key = `bug-reports/${ctx.businessId}/${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await getPresignedUploadUrl(key, input.contentType);
      return { uploadUrl, key };
    }),

  // --- triage (superadmin) -----------------------------------------------------------

  listAll: superadminProcedure
    .input(z.object({ status: z.enum([...STATUSES, "all"]).default("open") }).optional())
    .query(async ({ ctx, input }) => {
      const status = input?.status ?? "open";

      const rows = await ctx.db
        .select({
          report: bugReport,
          businessName: business.name,
          businessSlug: business.slug,
          reporterName: user.name,
          reporterEmail: user.email,
        })
        .from(bugReport)
        .leftJoin(business, eq(bugReport.businessId, business.id))
        .leftJoin(user, eq(bugReport.reportedByUserId, user.id))
        .where(status === "all" ? undefined : eq(bugReport.status, status))
        .orderBy(asc(bugReport.createdAt))
        .limit(200);

      // Severity ordering in JS rather than SQL: the ranking is a product decision
      // ("blocking" is worse than "annoying"), not something the text column knows.
      return rows
        .map((r) => ({
          ...r.report,
          businessName: r.businessName,
          businessSlug: r.businessSlug,
          reporterName: r.reporterName,
          reporterEmail: r.reporterEmail,
          screenshotUrl: r.report.screenshotS3Key ? getPublicUrl(r.report.screenshotS3Key) : null,
        }))
        .sort(
          (a, b) =>
            (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        );
    }),

  updateStatus: superadminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(STATUSES),
        adminNote: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isResolved = input.status === "fixed" || input.status === "wont_fix";

      const [updated] = await ctx.db
        .update(bugReport)
        .set({
          status: input.status,
          adminNote: input.adminNote,
          resolvedAt: isResolved ? new Date() : null,
        })
        .where(eq(bugReport.id, input.id))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });

      // Tell the merchant. A status that only we can see is not a status.
      if (isResolved) {
        await ctx.db.insert(notification).values({
          businessId: updated.businessId,
          type: "bug_report_resolved",
          title: input.status === "fixed" ? "A problem you reported is fixed" : "Update on your report",
          body: input.adminNote ?? undefined,
          link: "/dashboard/report",
        });
      }

      return { ok: true };
    }),
} satisfies TRPCRouterRecord;
