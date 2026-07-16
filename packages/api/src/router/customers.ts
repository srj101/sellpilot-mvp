import type { TRPCRouterRecord } from "@trpc/server";

import { desc, eq } from "@acme/db";
import { customer } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const customersRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(customer)
      .where(eq(customer.userId, ctx.session.user.id))
      .orderBy(desc(customer.createdAt));
  }),
} satisfies TRPCRouterRecord;
