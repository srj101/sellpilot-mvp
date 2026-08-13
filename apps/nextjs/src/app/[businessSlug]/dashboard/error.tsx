"use client";

import { useParams } from "next/navigation";

import { Button } from "@acme/ui/button";

import { isForbiddenError, PermissionDeniedCard } from "./_components/permission-denied-card";

/**
 * Route-segment error boundary for everything under /{businessSlug}/dashboard/*.
 * Server Component pages here call the tRPC caller directly (see ~/trpc/caller.ts),
 * so a permissionProcedure FORBIDDEN throw would otherwise surface as Next.js's raw
 * "Runtime TRPCError" crash screen instead of a page the user can actually act on.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ businessSlug: string }>();

  if (isForbiddenError(error)) {
    return <PermissionDeniedCard businessSlug={params.businessSlug} message={error.message} />;
  }

  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center p-10 text-center">
      <h2 className="text-xl font-semibold tracking-tight">Something went wrong</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        An unexpected error occurred while loading this page.
      </p>
      <div className="mt-6">
        <Button variant="outline" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
