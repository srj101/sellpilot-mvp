import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { businessMember } from "@acme/db/schema";

/**
 * For routes with no /{businessSlug} in the URL (bare API routes outside the dashboard
 * tree) — resolves the caller's store from their active/first membership, the same
 * fallback orgProcedure uses when there's no URL slug to trust instead.
 */
export async function resolveActiveBusinessId(
  userId: string,
  activeBusinessId?: string | null,
): Promise<string> {
  const memberships = await db.select({ businessId: businessMember.businessId }).from(businessMember).where(eq(businessMember.userId, userId));
  const match = activeBusinessId ? memberships.find((m) => m.businessId === activeBusinessId) : undefined;
  const businessId = (match ?? memberships[0])?.businessId;
  if (!businessId) throw new Error("No business found for this account.");
  return businessId;
}
