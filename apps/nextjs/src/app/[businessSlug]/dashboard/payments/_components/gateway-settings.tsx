"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Skeleton } from "@acme/ui/skeleton";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * This business's OWN SSLCommerz store — separate from SellPilot's platform account (that's
 * a superadmin-only setting, see superadmin's Payment Configuration panel). Customer orders
 * settle directly into whichever store is configured here; until it is, checkout only offers
 * Cash on Delivery (see checkout.ts's startOnlinePayment).
 * Owner-only — getGatewayCredentials/updateGatewayCredentials both 403 for non-owner staff,
 * so this quietly renders nothing for them rather than a broken form. The query itself is
 * gated on isOwner (not just left to fail and be swallowed by isError) so non-owner staff
 * don't generate a background FORBIDDEN error on every Payments page visit.
 */
export function GatewaySettings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: myPermissions, isPending: permissionsPending } = useQuery(trpc.roles.getMyPermissions.queryOptions());
  const isOwner = myPermissions?.role === "owner";
  const { data, isPending: credentialsPending, isError } = useQuery(
    trpc.payments.getGatewayCredentials.queryOptions(undefined, { enabled: isOwner }),
  );
  // Still figuring out whether this member is the owner — keep showing the loading shell
  // instead of flashing "nothing" for an owner whose permissions just haven't loaded yet.
  const isPending = permissionsPending || (isOwner && credentialsPending);
  const [storeId, setStoreId] = useState("");
  const [storePassword, setStorePassword] = useState("");

  useEffect(() => {
    if (data) setStoreId(data.storeId);
  }, [data]);

  const update = useMutation(
    trpc.payments.updateGatewayCredentials.mutationOptions({
      onSuccess: () => {
        toast.success("Payment gateway saved.");
        setStorePassword("");
        void qc.invalidateQueries({ queryKey: trpc.payments.getGatewayCredentials.queryKey() });
        void qc.invalidateQueries({ queryKey: trpc.payments.getGatewayStatus.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (!permissionsPending && (!isOwner || isError)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Online Payment Gateway
        </CardTitle>
        <CardDescription>
          Your own SSLCommerz store — customer payments settle directly here. Until this is set, customers only see Cash on Delivery.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full max-w-md" />
            <Skeleton className="h-9 w-full max-w-md" />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ storeId, storePassword: storePassword || undefined });
            }}
            className="grid gap-4 sm:grid-cols-2 sm:items-end max-w-2xl"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ssl-store-id">Store ID</Label>
              <Input id="ssl-store-id" value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="e.g. yourshop_live" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ssl-store-password">Store Password</Label>
              <Input
                id="ssl-store-password"
                type="password"
                value={storePassword}
                onChange={(e) => setStorePassword(e.target.value)}
                placeholder={data?.hasPassword ? "•••••••• (unchanged)" : "Enter store password"}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={update.isPending || !storeId.trim()}>
                {update.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
