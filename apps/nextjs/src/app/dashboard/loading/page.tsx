"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

/**
 * Entry point right after login — no business slug is known yet, so
 * `x-business-slug` (middleware.ts) can't be set and any permission check run
 * from here would resolve against session.activeBusinessId instead of
 * whichever business we're about to send the user into (businesses[0]),
 * which can be a different business with a different role. Once we know the
 * slug, hand off to the businessSlug-scoped loading page — its permission
 * check runs with the right `x-business-slug` header, so it's the only place
 * that decides which page the user actually lands on.
 */
export default function LoadingPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const { data: businesses, isLoading: bizLoading, error } = useQuery(
    trpc.business.listMine.queryOptions()
  );

  useEffect(() => {
    if (bizLoading) return;

    if (error) {
      console.error("Failed to fetch businesses in loading page:", error);
    }

    if (!businesses || businesses.length === 0) {
      // No businesses: likely not authenticated or no membership
      router.replace("/login");
      return;
    }

    const slug = businesses[0]?.slug;
    router.replace(`/${slug}/dashboard/loading`);
  }, [businesses, bizLoading, error, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Preparing...</h1>
        <p className="text-muted-foreground">Please wait while we load your dashboard.</p>
      </div>
    </div>
  );
}