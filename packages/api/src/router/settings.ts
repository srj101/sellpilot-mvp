import type { TRPCRouterRecord } from "@trpc/server";

import { desc, eq } from "@acme/db";
import { policy } from "@acme/db/schema";

import { businessScopedProcedure } from "../trpc";

export const settingsRouter = {
  /**
   * Unlike agent.listPolicies (active-only, for the AI's runtime use), this
   * returns every policy — the settings page needs to manage inactive ones too.
   */
  listAllPolicies: businessScopedProcedure.query(({ ctx }) => {
    return ctx.db.query.policy.findMany({
      where: eq(policy.businessId, ctx.businessId),
      orderBy: desc(policy.createdAt),
    });
  }),
} satisfies TRPCRouterRecord;
