"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  Edit,
  Eye,
  FileDown,
  ImageIcon,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@acme/ui/dialog";
import { Skeleton } from "@acme/ui/skeleton";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { ConfirmDialog } from "~/app/[businessSlug]/dashboard/_components/confirm-dialog";
import { useTRPC } from "~/trpc/react";
import { useBusinessSlug } from "~/hooks/use-business-slug";
import { ProductForm } from "./product-form";

interface BulkRow {
  title: string;
  category?: string;
  gender?: string;
  price: number;
  discountPercent?: number;
  stockQty: number;
  description?: string;
  rating?: number;
  imageUrl?: string;
}

function pickField(row: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

const GENDER_VALUES = new Set(["men", "women", "unisex", "kids"]);
function normalizeGender(raw: string | undefined) {
  const v = raw?.trim().toLowerCase();
  return v && GENDER_VALUES.has(v) ? v : undefined;
}

function StockBadge({ status, qty }: { status: "in_stock" | "low_stock" | "out_of_stock"; qty: number }) {
  if (status === "out_of_stock") {
    return <Badge variant="destructive">Out of Stock</Badge>;
  }
  if (status === "low_stock") {
    return <Badge className="bg-(--warning)/10 text-(--warning) border-(--warning)/20">Low Stock ({qty} left)</Badge>;
  }
  return <Badge className="bg-(--success)/10 text-(--success) border-(--success)/20">{qty} in stock</Badge>;
}

export function ProductsClient() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const businessSlug = useBusinessSlug();
  const deleteProductMutation = useMutation(trpc.products.delete.mutationOptions());
  const testImageSearchMutation = useMutation(trpc.products.testImageSearch.mutationOptions());
  const bulkCreateMutation = useMutation(trpc.products.bulkCreate.mutationOptions());
  const { data: usage } = useQuery(trpc.products.getUsage.queryOptions());
  const atLimit = usage?.remaining === 0;

  const [filterStatus, setFilterStatus] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const { data: productsData, isPending } = useQuery(trpc.products.list.queryOptions({ filterStatus }));
  const products = productsData?.products ?? [];
  const variants = productsData?.variants ?? [];
  const [view, setView] = useState<"list" | "create" | "edit" | "sandbox">(
    "list",
  );
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // CSV bulk import state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<BulkRow[]>([]);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number } | null>(null);

  // Search Sandbox state
  const [sandboxImageUrl, setSandboxImageUrl] = useState("");
  const [sandboxResults, setSandboxResults] = useState<any[]>([]);
  const [isSearchingSandbox, setIsSearchingSandbox] = useState(false);
  const [sandboxError, setSandboxError] = useState("");

  const getProductVariants = (productId: string) => {
    return variants.filter((v) => v.productId === productId);
  };

  const getProductPriceRange = (productId: string, defaultPrice: number = 0) => {
    const prodVariants = getProductVariants(productId);
    if (prodVariants.length === 0) return `৳${Math.round(defaultPrice).toLocaleString()}`;

    const prices = prodVariants.map((v) => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (minPrice === maxPrice) return `৳${Math.round(minPrice).toLocaleString()}`;
    return `৳${Math.round(minPrice).toLocaleString()} - ৳${Math.round(maxPrice).toLocaleString()}`;
  };

  const getProductTotalStock = (productId: string) => {
    const prodVariants = getProductVariants(productId);
    if (prodVariants.length === 0) return 0;
    return prodVariants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
  };

  const handleEditClick = (product: any) => {
    const prodVariants = getProductVariants(product.id);
    setEditingProduct({
      ...product,
      variants: prodVariants,
    });
    setView("edit");
  };

  const handleDeleteClick = (productId: string) => {
    setDeleteTarget(productId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProductMutation.mutateAsync({ productId: deleteTarget });
      void qc.invalidateQueries({ queryKey: trpc.products.list.queryKey() });
      setDeleteTarget(null);
    } catch {
      alert("Failed to delete product");
    }
  };

  function openImportDialog() {
    setCsvRows([]);
    setCsvSkipped(0);
    setCsvFileName(null);
    setCsvError(null);
    setImportSummary(null);
    setIsImportOpen(true);
  }

  function parseCsv(file: File) {
    setCsvError(null);
    setImportSummary(null);
    setCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: BulkRow[] = [];
        let skipped = 0;
        for (const row of results.data) {
          const title = pickField(row, "title", "Title", "name", "Name")?.trim();
          const priceRaw = pickField(row, "price", "Price");
          const price = Number(priceRaw);
          if (!title || !priceRaw || Number.isNaN(price) || price <= 0) {
            skipped++;
            continue;
          }
          const discountRaw = pickField(row, "discountPercent", "Discount%", "discount");
          const ratingRaw = pickField(row, "rating", "Rating");
          rows.push({
            title,
            category: pickField(row, "category", "Category"),
            gender: normalizeGender(pickField(row, "gender", "Gender")),
            price,
            discountPercent: discountRaw ? Number(discountRaw) : undefined,
            stockQty: Number(pickField(row, "stockQty", "Stock Qty", "stock") ?? 0) || 0,
            description: pickField(row, "description", "Description"),
            rating: ratingRaw ? Number(ratingRaw) : undefined,
            imageUrl: pickField(row, "imageUrl", "Image", "image"),
          });
        }

        if (rows.length > 500) {
          setCsvError(`This file has ${rows.length} valid rows — the limit is 500 per import. Please split it into multiple files.`);
          setCsvRows([]);
          setCsvSkipped(0);
          return;
        }
        if (rows.length === 0) {
          setCsvError("No valid rows found — make sure each row has a title and a price.");
        }
        setCsvRows(rows);
        setCsvSkipped(skipped);
      },
      error: (err) => setCsvError(err.message),
    });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) parseCsv(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseCsv(file);
  }

  function downloadTemplate() {
    const header = "title,category,gender,price,discountPercent,stockQty,description,rating,imageUrl\n";
    const sample = "Ceramic Flower Vase,Decor,,450,10,20,Hand-finished ceramic vase,,https://example.com/vase.jpg\n";
    const blob = new Blob([header + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sellpilot-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (csvRows.length === 0) return;
    setIsImporting(true);
    setCsvError(null);
    try {
      const result = await bulkCreateMutation.mutateAsync({ products: csvRows as any });
      if (result.skipped > 0) {
        setImportSummary({ imported: result.imported, skipped: result.skipped });
      } else {
        toast.success(`Imported ${result.imported} product${result.imported === 1 ? "" : "s"}`);
        window.location.reload();
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Import failed — please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  const handleSandboxSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxImageUrl.trim()) {
      setSandboxError("Please enter or upload an image");
      return;
    }

    setIsSearchingSandbox(true);
    setSandboxError("");
    setSandboxResults([]);

    try {
      const results = await testImageSearchMutation.mutateAsync({ imageUrl: sandboxImageUrl.trim() });
      setSandboxResults(results);
    } catch (err: any) {
      setSandboxError(
        err?.message ?? "Error searching image index. Is NVIDIA_API_KEY configured?",
      );
    } finally {
      setIsSearchingSandbox(false);
    }
  };

  // Image Upload helper for Sandbox (base64 encode)
  const handleSandboxImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setSandboxImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  if (view === "create") {
    return (
      <ProductForm
        onSave={() => window.location.reload()}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit") {
    return (
      <ProductForm
        initialProduct={editingProduct}
        onSave={() => window.location.reload()}
        onCancel={() => setView("list")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ marginBottom: "var(--haze-section-gap, 24px)" }}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your product catalog and variations</p>
        </div>
        <div className="flex items-center gap-2">
          {usage && (
            <div
              title={`${usage.used} of ${usage.limit} products used on ${usage.planName}`}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
                atLimit ? "border-(--warning)/30 bg-(--warning)/5 text-(--warning)" : "text-muted-foreground",
              )}
            >
              {atLimit && <Lock className="h-3 w-3 shrink-0" />}
              <span>{usage.used}/{usage.limit}</span>
              <div className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                <div
                  className={cn("h-full rounded-full transition-all", atLimit ? "bg-(--warning)" : "bg-primary")}
                  style={{ width: `${Math.min(100, Math.round((usage.used / usage.limit) * 100))}%` }}
                />
              </div>
            </div>
          )}
          <Button
            variant={view === "sandbox" ? "default" : "outline"}
            size="sm"
            onClick={() => setView(view === "sandbox" ? "list" : "sandbox")}
            className="h-8 gap-1.5 text-xs"
          >
            <Eye className="h-4 w-4" />
            {view === "sandbox" ? "Back to Products" : "Vector Sandbox"}
          </Button>
          <Button variant="outline" size="sm" onClick={openImportDialog} className="h-8 gap-1.5 text-xs">
            <UploadCloud className="h-4 w-4" />
            Import CSV
          </Button>
          {atLimit ? (
            <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
              <Link href={`/${businessSlug}/dashboard/billing`}>
                <Lock className="h-4 w-4" />
                Upgrade
              </Link>
            </Button>
          ) : (
            <Button size="sm" onClick={() => setView("create")} className="h-8 gap-1.5 text-xs">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          )}
        </div>
      </div>

      {view === "sandbox" ? (
        /* IMAGE VECTOR SEARCH SANDBOX */
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="bg-card h-fit space-y-5 rounded-[28px] border p-6 shadow-sm">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                Image Vector Query
              </h3>
              <p className="text-muted-foreground text-xs leading-5">
                Query product database by image. Uses the client-specific vector embeddings filtered by user tenant ID.
              </p>
            </div>

            <form onSubmit={handleSandboxSearch} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                  Image URL
                </label>
                <Input
                  value={sandboxImageUrl}
                  onChange={(e) => setSandboxImageUrl(e.target.value)}
                  placeholder="Paste product image URL..."
                  className="rounded-xl border bg-background/50 focus:bg-background"
                />
              </div>

              <div className="flex items-center justify-center rounded-2xl border-2 border-dashed bg-background/50 p-4 text-center hover:bg-background transition-colors relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSandboxImageUpload}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <div className="space-y-1">
                  <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                  <div className="text-xs font-semibold text-foreground">
                    Upload query image
                  </div>
                </div>
              </div>

              {sandboxImageUrl && (
                <div className="bg-background relative aspect-video w-full overflow-hidden rounded-xl border shadow-inner">
                  <img
                    src={sandboxImageUrl}
                    alt="Query Preview"
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setSandboxImageUrl("")}
                    className="bg-destructive text-destructive-foreground absolute right-2 top-2 rounded-full p-1.5 shadow-md"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSearchingSandbox}
                className="w-full"
              >
                {isSearchingSandbox ? "Searching..." : "Search Image"}
              </Button>
            </form>

            {sandboxError && (
              <div className="bg-destructive/10 border-destructive/20 text-destructive flex items-start gap-2.5 rounded-xl border p-3.5 text-xs shadow-sm">
                <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                <div>{sandboxError}</div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-card flex items-center justify-between rounded-[28px] border px-6 py-5 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Vector Match Results
                </h3>
                <p className="text-muted-foreground text-xs leading-5">
                  Closest matches by image similarity. Uses cosine distance (closer to 0 means exact match).
                </p>
              </div>
              <Badge variant="secondary">
                {sandboxResults.length} matches
              </Badge>
            </div>

            <div className="space-y-3">
              {sandboxResults.map((res, index) => (
                <div
                  key={index}
                  className="bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-sm"
                >
                  <div className="bg-background h-16 w-16 shrink-0 overflow-hidden rounded-xl border shadow-sm">
                    <img
                      src={res.imageUrl}
                      alt={res.productTitle}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-foreground">
                      {res.product?.title ?? res.productTitle}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {res.variantId ? `Variant: ${res.productTitle.split("(")[1]?.replace(")", "") || "Custom"}` : "Product main image"}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-primary text-xs font-semibold">
                        Price: {res.product ? getProductPriceRange(res.product.id) : "N/A"}
                      </span>
                      <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                        Chroma Distance: {res.distance.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (res.product) handleEditClick(res.product);
                    }}
                  >
                    View Product
                  </Button>
                </div>
              ))}

              {sandboxResults.length === 0 && !isSearchingSandbox && (
                <div className="bg-card flex min-h-[300px] flex-col items-center justify-center rounded-[28px] border border-dashed p-10 text-center shadow-sm">
                  <div className="bg-background mb-4 flex h-12 w-12 items-center justify-center rounded-xl border shadow-sm">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h4 className="text-md font-semibold tracking-tight text-foreground">
                    No query results yet
                  </h4>
                  <p className="text-muted-foreground max-w-sm mt-1 text-xs leading-5">
                    Paste an image URL or upload a file in the sidebar, and run a search to query vectors.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* PRODUCT CATALOG LISTING */
        <div className="space-y-4">
          <div className="flex items-center gap-1 border-b pb-2 text-xs">
            {(["all", "in_stock", "low_stock", "out_of_stock"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition-colors capitalize",
                  filterStatus === st
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                {st.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Product</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Price</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Stock</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Variants</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isPending && (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                            <div className="space-y-1.5">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-44" />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-12" /></td>
                      </tr>
                    ))
                  )}

                  {!isPending && products.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-background h-10 w-10 shrink-0 overflow-hidden rounded-xl border shadow-sm">
                            {p.images && p.images[0] ? (
                              <img
                                src={p.images[0]}
                                alt={p.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {p.title}
                            </div>
                            <div className="text-muted-foreground line-clamp-1 max-w-xs text-xs">
                              {p.description || "No description"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          p.status === "active"
                            ? "bg-(--success)/10 text-(--success)"
                            : "bg-gray-500/10 text-gray-500"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">
                        {getProductPriceRange(p.id)}
                      </td>
                      <td className="px-4 py-3">
                        <StockBadge
                          status={(p as any).stockStatus ?? "in_stock"}
                          qty={(p as any).totalInventoryQuantity ?? getProductTotalStock(p.id)}
                        />
                      </td>
                    <td className="px-4 py-3 text-xs font-medium text-muted-foreground">
                      {getProductVariants(p.id).length || 1} variants
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(p)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          aria-label="Edit"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(p.id)}
                          className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!isPending && products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <div className="bg-background mb-4 flex h-12 w-12 items-center justify-center rounded-xl border shadow-sm">
                          <Archive className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">
                          No products found
                        </h3>
                        <p className="text-muted-foreground max-w-sm mt-1 text-xs leading-relaxed">
                          Create your first product to generate variation image vector embeddings for AI recommendations.
                        </p>
                        <Button
                          onClick={() => setView("create")}
                          className="mt-4 h-8 text-xs gap-1.5"
                        >
                          <Plus className="h-4 w-4" /> Create Product
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* CSV Bulk Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
            <DialogTitle className="text-xl">Import Products from CSV</DialogTitle>
            <DialogDescription>
              Bulk-add products from a spreadsheet. Colour/size variants aren't supported via CSV yet — use Manual Entry for those.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 sm:px-8">
            {usage && (
              <div className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-xs",
                atLimit ? "border-(--warning)/30 bg-(--warning)/5 text-(--warning)" : "text-muted-foreground",
              )}>
                <span>{usage.used} of {usage.limit} products used on {usage.planName}</span>
                <span className="font-semibold">{usage.remaining} remaining</span>
              </div>
            )}

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-xl border-2 border-dashed p-8 bg-muted/20 flex flex-col items-center justify-center text-center gap-3 transition-colors",
                isDragging && "border-primary bg-primary/5",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold">Drop your CSV here</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Or click below to browse. Image URLs must be publicly reachable.
                </p>
              </div>
              <div className="flex gap-2.5 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
                  <FileDown className="h-3.5 w-3.5" />
                  Template
                </Button>
                <label className="cursor-pointer">
                  <span className="inline-flex items-center rounded-md bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80 transition-colors">
                    Browse Files
                  </span>
                  <input type="file" accept=".csv" className="sr-only" onChange={handleFileInput} />
                </label>
              </div>
              {csvFileName && <p className="text-xs text-muted-foreground">Loaded: {csvFileName}</p>}
            </div>

            {csvError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {csvError}
              </div>
            )}

            {importSummary && (
              <div className="rounded-lg border border-(--warning)/30 bg-(--warning)/5 p-3 text-sm text-(--warning)">
                <p className="flex items-center gap-2 font-medium">
                  <Lock className="h-4 w-4 shrink-0" />
                  Imported {importSummary.imported} product{importSummary.imported === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs">
                  {importSummary.skipped} row{importSummary.skipped > 1 ? "s were" : " was"} skipped — you've reached your plan's product limit.{" "}
                  <Link href={`/${businessSlug}/dashboard/billing`} className="font-medium underline underline-offset-2">Upgrade</Link> to import the rest.
                </p>
              </div>
            )}

            {csvRows.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {csvRows.length} valid row{csvRows.length > 1 ? "s" : ""}
                  {csvSkipped > 0 ? ` — ${csvSkipped} skipped (missing title/price)` : ""}
                </p>
                {usage && csvRows.length > usage.remaining && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-(--warning)/30 bg-(--warning)/5 p-3 text-xs text-(--warning)">
                    <Lock className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                    <span>
                      Your {usage.planName} plan allows {usage.limit} products and you have {usage.remaining} slot{usage.remaining === 1 ? "" : "s"} left.
                      Only the first {usage.remaining} of {csvRows.length} rows will be imported (in file order) — the rest will be skipped.{" "}
                      <Link href={`/${businessSlug}/dashboard/billing`} className="font-medium underline underline-offset-2">Upgrade</Link> to import all of them.
                    </span>
                  </p>
                )}
                <div className="overflow-x-auto rounded-lg border max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Gender</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} className={cn("border-t", usage && i >= usage.remaining && "opacity-40")}>
                          <td className="px-3 py-2">{r.title}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.category ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.gender ?? "—"}</td>
                          <td className="px-3 py-2">{r.price}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.stockQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {csvRows.length > 0 && (
            <div className="shrink-0 border-t px-6 py-4 sm:px-8 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting || usage?.remaining === 0} className="gap-1.5">
                {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                {(() => {
                  const importCount = usage ? Math.min(csvRows.length, usage.remaining) : csvRows.length;
                  return `Import ${importCount} Product${importCount === 1 ? "" : "s"}`;
                })()}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete product?"
        description="This will permanently remove the product and its variants. This action can't be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteProductMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
