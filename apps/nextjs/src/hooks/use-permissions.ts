"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

/**
 * Client-side mirror of the resource:action checks every permissionProcedure already
 * enforces server-side. The backend is the actual guard — this only decides whether to
 * show or hide the create/edit/delete affordance that calls it, so a member without the
 * permission doesn't see a button that would just 403.
 */
export function usePermissions() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.roles.getMyPermissions.queryOptions());
  const isOwner = data?.role === "owner";
  const permissions = data?.permissions ?? [];
  const hasAll = permissions.includes("*");

  const can = (resource: string, action: string) => {
    if (isOwner || hasAll) return true;
    return permissions.includes(`${resource}:${action}`);
  };

  return { can, isOwner, role: data?.role, isLoading };
}
