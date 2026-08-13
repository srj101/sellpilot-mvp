import Link from "next/link";
import { TRPCClientError } from "@trpc/client";
import { ShieldAlert } from "lucide-react";

import { Button } from "@acme/ui/button";

/**
 * True for the FORBIDDEN error permissionProcedure (packages/api/src/trpc.ts)
 * throws when a member's role lacks a resource:action permission — as opposed
 * to any other tRPC error, which should keep failing loudly instead of being
 * hidden behind a friendly card.
 */
export function isForbiddenError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return (error.data as { code?: string } | undefined)?.code === "FORBIDDEN";
  }
  return error instanceof Error && error.message.startsWith("Your role doesn't allow you to");
}

export function PermissionDeniedCard({
  businessSlug,
  message,
}: {
  businessSlug: string;
  message?: string;
}) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Access restricted</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {message ?? "Your role doesn't have permission to view this page."} Ask a store owner or
        admin to update your role if you need access.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href={`/${businessSlug}/dashboard/loading`}>Go to my dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
