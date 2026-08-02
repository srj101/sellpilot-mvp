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
 * The SellPilot PLATFORM's own SSLCommerz store — for SaaS billing only (business owners
 * paying SellPilot for their plan). Completely separate from any business's own store,
 * which each owner configures on their own dashboard's Payments page — mixing these up would
 * route a business's customer payments into the platform's account instead of the business's.
 */
export function PlatformPaymentSettings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(trpc.superadmin.getPaymentSettings.queryOptions());
  const [storeId, setStoreId] = useState("");
  const [storePassword, setStorePassword] = useState("");

  useEffect(() => {
    if (data) setStoreId(data.storeId);
  }, [data]);

  const update = useMutation(
    trpc.superadmin.updatePaymentSettings.mutationOptions({
      onSuccess: () => {
        toast.success("Platform payment settings saved.");
        setStorePassword("");
        void qc.invalidateQueries({ queryKey: trpc.superadmin.getPaymentSettings.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Payment Configuration
        </CardTitle>
        <CardDescription>
          SellPilot's own SSLCommerz store — used only for SaaS subscription billing (businesses paying for their plan). Each business's own
          customer checkout uses their own store, configured on their own Payments page.
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
              <Label htmlFor="platform-ssl-store-id">Store ID</Label>
              <Input id="platform-ssl-store-id" value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="e.g. sellpilot_live" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform-ssl-store-password">Store Password</Label>
              <Input
                id="platform-ssl-store-password"
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
