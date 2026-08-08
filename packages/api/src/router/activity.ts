import { and, desc, eq, lt } from "@acme/db";
import { activityLog } from "@acme/db/schema";
import { z } from "zod/v4";

import { createTRPCRouter, permissionProcedure } from "../trpc";

export const activityRouter = createTRPCRouter({
  list: permissionProcedure("activity", "view")
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(), // id of last item
        entityType: z.string().optional(),
        actorUserId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;

      let cursorItem: typeof activityLog.$inferSelect | undefined;
      if (input.cursor) {
        const [found] = await ctx.db
          .select()
          .from(activityLog)
          .where(and(eq(activityLog.businessId, ctx.businessId), eq(activityLog.id, input.cursor)))
          .limit(1);
        cursorItem = found;
      }

      const conditions = [eq(activityLog.businessId, ctx.businessId)];

      if (cursorItem) {
        // Simple keyset pagination using createdAt
        conditions.push(lt(activityLog.createdAt, cursorItem.createdAt));
      }

      if (input.entityType && input.entityType !== "all") {
        conditions.push(eq(activityLog.entityType, input.entityType));
      }

      if (input.actorUserId) {
        conditions.push(eq(activityLog.actorUserId, input.actorUserId));
      }

      const items = await ctx.db
        .select()
        .from(activityLog)
        .where(and(...conditions))
        .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
        .limit(limit + 1);

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items,
        nextCursor,
      };
    }),
});
