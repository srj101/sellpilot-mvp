"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckSquare,
  ImageIcon,
  Loader2,
  Lock,
  Minus,
  Plug,
  Square,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@acme/ui/dialog";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { useBusinessSlug } from "~/hooks/use-business-slug";

interface SourceProduct {
  externalProductId: string;
  title: string;
  category: string | null;
  status: "active" | "draft" | "archived";
  images: string[];
  options: { name: string; values: string[] }[];
  rating: number | null;
  variantCount: number;
  alreadyImported: boolean;
}

interface Connection {
  id: string;
  provider: "shopify" | "woocommerce";
  storeName: string | null;
  storeUrl: string;
  status: string;
}

export function ImportFromStoreDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const businessSlug = useBusinessSlug();

  const { data: connectionsData } = useQuery(trpc.storeConnections.list.queryOptions());
  const connections = connectionsData ?? [];

  const activeConnection = connections[0] as Connection | undefined;

  const { data: usage } = useQuery(trpc.products.getUsage.queryOptions());
  const atLimit = usage?.remaining === 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gender, setGender] = useState<"men" | "women" | "unisex" | "kids" | "">("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");

  const getSourceProductsQuery = useQuery(
    trpc.imports.getSourceProducts.queryOptions(
      { connectionId: activeConnection?.id ?? "", onlyActive: true },
      { enabled: open && !!activeConnection },
    ),
  );
  const sourceProducts = useMemo(() => getSourceProductsQuery.data?.products ?? [], [getSourceProductsQuery.data]);
  const selectable = useMemo(() => sourceProducts.filter((p) => !p.alreadyImported), [sourceProducts]);
  const importable = useMemo(() => selectable.filter((p) => selected.has(p.externalProductId)), [selectable, selected]);

  const importMutation = useMutation(trpc.imports.importProducts.mutationOptions());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (!usage || next.size < usage.remaining) next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!usage) return;
    if (importable.length === 0) return;
    const allSelected = importable.every((p) => selected.has(p.externalProductId));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.slice(0, usage.remaining).map((p) => p.externalProductId)));
    }
  };

  const handleImport = async () => {
    if (!activeConnection || importable.length === 0) return;
    try {
      const result = await importMutation.mutateAsync({
        connectionId: activeConnection.id,
        externalProductIds: importable.map((p) => p.externalProductId),
        gender: gender || null,
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : undefined,
      });
      toast.success(`Imported ${result.imported} product${result.imported === 1 ? "" : "s"}`);
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: trpc.products.list.queryKey() });
      void qc.invalidateQueries({ queryKey: trpc.products.getUsage.queryKey() });
      void qc.invalidateQueries({ queryKey: trpc.imports.getSourceProducts.queryKey() });
      if (result.skipped > 0) {
        toast.info(`${result.skipped} skipped — you hit your ${result.planName} product limit`);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed — please try again.");
    }
  };

  const checkboxFor = (p: SourceProduct) => {
    if (p.alreadyImported) return <Check className="h-3.5 w-3.5 opacity-0" />;
    return selected.has(p.externalProductId) ? (
      <CheckSquare className="h-4 w-4 text-primary" />
    ) : (
      <Square className="h-4 w-4 text-muted-foreground/60" />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
          <DialogTitle className="text-xl">Import from Store</DialogTitle>
          <DialogDescription>
            Pick products from your connected store to add to your SellPilot catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 sm:px-8">
          {!activeConnection ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Plug className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">No store connected yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Connect a Shopify or WooCommerce store first, then come back here to import products.
                </p>
              </div>
              <Button asChild className="mt-2 gap-1.5">
                <Link href={`/${businessSlug}/dashboard/store-connections`}>
                  <Plug className="h-4 w-4" />
                  Connect a store
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {usage && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-xs",
                    atLimit ? "border-(--warning)/30 bg-(--warning)/5 text-(--warning)" : "text-muted-foreground",
                  )}
                >
                  <span>
                    {usage.used} of {usage.limit} products used on {usage.planName} · importing from{" "}
                    <span className="font-medium">{activeConnection.storeName ?? activeConnection.storeUrl}</span>
                  </span>
                  <span className="font-semibold">{usage.remaining} remaining</span>
                </div>
              )}

              {atLimit && (
                <div className="flex items-start gap-2 rounded-lg border border-(--warning)/30 bg-(--warning)/5 p-3 text-xs text-(--warning)">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    You've reached your {usage.planName} product limit.{" "}
                    <Link href={`/${businessSlug}/dashboard/billing`} className="font-medium underline underline-offset-2">
                      Upgrade
                    </Link>{" "}
                    or{" "}
                    <Link href={`/${businessSlug}/dashboard/products`} className="font-medium underline underline-offset-2">
                      remove products
                    </Link>{" "}
                    to import more.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="space-y-1">
                  <Label htmlFor="import-gender" className="text-xs font-medium text-muted-foreground">
                    Default gender (optional)
                  </Label>
                  <select
                    id="import-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as typeof gender)}
                    className="h-8 rounded-md border bg-background px-2 text-sm focus-visible:ring-ring focus-visible:ring-[3px] outline-none"
                  >
                    <option value="">Not set</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="unisex">Unisex</option>
                    <option value="kids">Kids</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="import-threshold" className="text-xs font-medium text-muted-foreground">
                    Low-stock threshold
                  </Label>
                  <Input
                    id="import-threshold"
                    type="number"
                    min={0}
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    placeholder="5"
                    className="h-8 w-24"
                  />
                </div>
              </div>

              {getSourceProductsQuery.isPending && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching products from {activeConnection.storeName ?? "store"}…
                </div>
              )}

              {getSourceProductsQuery.isError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Couldn't fetch products from this store.</p>
                    <p className="mt-0.5 text-xs">
                      {getSourceProductsQuery.error.message}
                    </p>
                  </div>
                </div>
              )}

              {!getSourceProductsQuery.isPending && !getSourceProductsQuery.isError && sourceProducts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {selectable.length} importable · {sourceProducts.length - selectable.length} already imported
                    </p>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={toggleAll}>
                      <Minus className="h-3.5 w-3.5" />
                      {importable.length > 0 && importable.every((p) => selected.has(p.externalProductId))
                        ? "Clear"
                        : "Select all"}
                    </Button>
                  </div>

                  <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border">
                    {sourceProducts.map((p) => {
                      const rowDisabled = p.alreadyImported || atLimit;
                      return (
                        <button
                          key={p.externalProductId}
                          type="button"
                          disabled={rowDisabled}
                          onClick={() => toggle(p.externalProductId)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                            rowDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-muted/40",
                            !rowDisabled && selected.has(p.externalProductId) && "bg-primary/5",
                          )}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {checkboxFor(p)}
                          </span>
                          <div className="bg-background h-10 w-10 shrink-0 overflow-hidden rounded-lg border">
                            {p.images[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {p.category ?? "No category"} · {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                              {p.rating ? ` · ★ ${p.rating}` : ""}
                            </p>
                          </div>
                          {p.alreadyImported && (
                            <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
                              Imported
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!getSourceProductsQuery.isPending &&
                !getSourceProductsQuery.isError &&
                sourceProducts.length === 0 && (
                  <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                    No {gender ? "" : ""}products found in this store.
                  </div>
                )}
            </>
          )}
        </div>

        {activeConnection && (
          <div className="shrink-0 border-t px-6 py-4 sm:px-8">
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground">
                {importable.length} selected
                {usage && usage.remaining < importable.length ? ` of max ${usage.remaining}` : ""}
              </span>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={importable.length === 0 || importMutation.isPending}
                className="gap-1.5"
              >
                {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {importable.length} Product{importable.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
