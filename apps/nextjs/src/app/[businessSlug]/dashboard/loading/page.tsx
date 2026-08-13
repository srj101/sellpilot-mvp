"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { usePermissions } from "~/hooks/use-permissions";

export default function LoadingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, can } = usePermissions();

  // Extract business slug from pathname like "/{slug}/dashboard/loading"
  const match = /\/([^/]+)\/dashboard\/loading/.exec(pathname);
  const businessSlug = match ? match[1] : "";
  const basePath = businessSlug ? `/${businessSlug}` : "";

  // Define priority: first matching permission wins. Resource/action are kept as
  // separate tuple slots (not a "resource:action" string) so this doesn't need a
  // runtime split() that TS can't prove always returns two parts.
  const priority: [string, string, string][] = [
    ["overview", "view", "/dashboard"],
    ["orders", "view", "/dashboard/orders"],
    ["products", "view", "/dashboard/products"],
    ["customers", "view", "/dashboard/customers"],
    ["analytics", "view", "/dashboard/analytics"],
    ["inbox", "view", "/dashboard/inbox"],
    ["support", "view", "/dashboard/support"], // same as inbox:view
    ["roles", "view", "/dashboard/roles"],
    ["activity", "view", "/dashboard/activity"],
    ["settings", "view", "/dashboard/settings"],
    // Add more as needed
  ];

  useEffect(() => {
    if (isLoading) {
      // Still loading permissions, wait
      return;
    }

    // Find the first permission we have
    for (const [resource, action, targetPath] of priority) {
      if (can(resource, action)) {
        const fullPath = `${basePath}${targetPath}`;
        router.replace(fullPath);
        return;
      }
    }

    // Fallback: if no permission matched, go to overview (will likely 403, but better than nothing)
    router.replace(`${basePath}/dashboard`);
  }, [isLoading, can, router, basePath, priority]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Redirecting...</h1>
        <p className="text-muted-foreground">Please wait while we send you to your dashboard.</p>
      </div>
    </div>
  );
}