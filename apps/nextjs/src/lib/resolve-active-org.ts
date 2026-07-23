import { eq } from "@acme/db";
import { db } from "@acme/db/client";
import { member } from "@acme/db/schema";

/**
 * For routes with no /{storeSlug} in the URL (bare API routes outside the dashboard
 * tree) — resolves the caller's store from their active/first membership, the same
 * fallback orgProcedure uses when there's no URL slug to trust instead.
 */
export async function resolveActiveOrganizationId(
  userId: string,
  activeOrganizationId?: string | null,
): Promise<string> {
  const memberships = await db.select({ organizationId: member.organizationId }).from(member).where(eq(member.userId, userId));
  const match = activeOrganizationId ? memberships.find((m) => m.organizationId === activeOrganizationId) : undefined;
  const organizationId = (match ?? memberships[0])?.organizationId;
  if (!organizationId) throw new Error("No store found for this account.");
  return organizationId;
}
