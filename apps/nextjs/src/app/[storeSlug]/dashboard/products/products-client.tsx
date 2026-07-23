"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  Edit,
  Eye,
  ImageIcon,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Separator } from "@acme/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";

import { useTRPC } from "~/trpc/react";
import { ProductForm } from "./product-form";

interface ProductsClientProps {
  initialProducts?: any[];
  initialVariants?: any[];
}

export function ProductsClient({
  initialProducts = [],
  initialVariants = [],
}: ProductsClientProps) {
  const trpc = useTRPC();
  const deleteProductMutation = useMutation(trpc.products.delete.mutationOptions());
  const testImageSearchMutation = useMutation(trpc.products.testImageSearch.mutationOptions());
  const [products, setProducts] = useState<any[]>(initialProducts ?? []);
  const [variants, setVariants] = useState<any[]>(initialVariants ?? []);
  const [view, setView] = useState<"list" | "create" | "edit" | "sandbox">(
    "list",
  );
  const [editingProduct, setEditingProduct] = useState<any>(null);

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

  const handleDeleteClick = async (productId: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      try {
        await deleteProductMutation.mutateAsync({ productId });
        // Refresh local state
        setProducts((prev) => prev.filter((p) => p.id !== productId));
        setVariants((prev) => prev.filter((v) => v.productId !== productId));
      } catch {
        alert("Failed to delete product");
      }
    }
  };

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
        err?.message ?? "Error searching image index. Is ChromaDB running?",
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
          <Button
            variant={view === "sandbox" ? "default" : "outline"}
            size="sm"
            onClick={() => setView(view === "sandbox" ? "list" : "sandbox")}
            className="h-8 gap-1.5 text-xs"
          >
            <Eye className="h-4 w-4" />
            {view === "sandbox" ? "Back to Products" : "Vector Sandbox"}
          </Button>
          <Button size="sm" onClick={() => setView("create")} className="h-8 gap-1.5 text-xs">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
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
                  Closest matches from ChromaDB vector space. Uses cosine similarity (distance close to 0 means exact match).
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
                {products.map((p) => (
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
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-gray-500/10 text-gray-500"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">
                      {getProductPriceRange(p.id)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {getProductTotalStock(p.id)} in stock
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

                {products.length === 0 && (
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
      )}
    </div>
  );
}
