import type { TRPCRouterRecord } from "@trpc/server";

import { desc, eq } from "@acme/db";
import { offer } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const offersRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(offer)
      .where(eq(offer.userId, ctx.session.user.id))
      .orderBy(desc(offer.createdAt));
  }),
} satisfies TRPCRouterRecord;
