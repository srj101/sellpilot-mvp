"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "~/hooks/use-permissions";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

export default function LoadingPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { isLoading: permLoading, can } = usePermissions();

  const { data: businesses, isLoading: bizLoading, error } = useQuery(
    trpc.business.listMine.queryOptions()
  );

  const [businessSlug, setBusinessSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // overall loading state

  useEffect(() => {
    if (bizLoading) {
      setIsLoading(true);
      return;
    }

    if (error) {
      console.error("Failed to fetch businesses in loading page:", error);
    }

    if (!businesses || businesses.length === 0) {
      // No businesses: likely not authenticated or no membership
      router.replace("/login");
      return;
    }

    // We know businesses is a non-empty array
    const first = businesses[0] as any;
    // Take the first business slug (non-null after length > 0 check)
    const slug = first.slug;
    setBusinessSlug(slug);
    setIsLoading(false);
  }, [businesses, bizLoading, error, router]);

  useEffect(() => {
    if (isLoading || !businessSlug || permLoading) {
      return;
    }

    // At this point, we have a valid businessSlug and permissions are loaded
    const slug = businessSlug; // non-null after check

    // Define priority: first matching permission wins
    const priority: [string, string][] = [
      ["overview:view", "/dashboard"],
      ["orders:view", "/dashboard/orders"],
      ["products:view", "/dashboard/products"],
      ["customers:view", "/dashboard/customers"],
      ["analytics:view", "/dashboard/analytics"],
      ["inbox:view", "/dashboard/inbox"],
      ["support:view", "/dashboard/support"], // same as inbox:view
      ["roles:view", "/dashboard/roles"],
      ["activity:view", "/dashboard/activity"],
      ["settings:view", "/dashboard/settings"],
      // Add more as needed
    ];

    // Find the first permission we have
    for (const [perm, targetPath] of priority) {
      const [resource, action] = perm.split(":");
      if (can(resource, action)) {
        const fullPath = `/${slug}${targetPath}`;
        router.replace(fullPath);
        return;
      }
    }

    // Fallback: go to overview (will likely 403 if no overview:view, but better than nothing)
    router.replace(`/${slug}/dashboard`);
  }, [businessSlug, isLoading, permLoading, router, can]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">Preparing...</h1>
          <p className="text-muted-foreground">Please wait while we load your dashboard.</p>
        </div>
      </div>
    );
  }

  // Should not reach here because we redirect in useEffect, but keep for safety
  return null;
}