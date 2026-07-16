"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Separator } from "@acme/ui/separator";

import { useTRPC } from "~/trpc/react";

interface ProductFormProps {
  initialProduct?: any; // If editing
  onSave: () => void;
  onCancel: () => void;
}

export function ProductForm({
  initialProduct,
  onSave,
  onCancel,
}: ProductFormProps) {
  const isEditing = !!initialProduct;
  const trpc = useTRPC();
  const createProductMutation = useMutation(trpc.products.create.mutationOptions());
  const updateProductMutation = useMutation(trpc.products.update.mutationOptions());

  const [title, setTitle] = useState(initialProduct?.title ?? "");
  const [description, setDescription] = useState(
    initialProduct?.description ?? "",
  );
  const [category, setCategory] = useState(initialProduct?.category ?? "");
  const [status, setStatus] = useState(initialProduct?.status ?? "active");
  const [images, setImages] = useState<string[]>(initialProduct?.images ?? []);
  const [newImageUrl, setNewImageUrl] = useState("");

  // Options: Shopify-like (e.g. Size: [M, L], Color: [Red, Blue])
  const [options, setOptions] = useState<{ name: string; values: string[] }[]>(
    initialProduct?.options ?? [],
  );
  const [hasVariants, setHasVariants] = useState(
    (initialProduct?.options?.length ?? 0) > 0,
  );

  // Default product details if no variants
  const [price, setPrice] = useState(
    initialProduct?.variants?.[0]?.price?.toString() ?? "0",
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    initialProduct?.variants?.[0]?.compareAtPrice?.toString() ?? "",
  );
  const [sku, setSku] = useState(initialProduct?.variants?.[0]?.sku ?? "");
  const [inventoryQuantity, setInventoryQuantity] = useState(
    initialProduct?.variants?.[0]?.inventoryQuantity?.toString() ?? "0",
  );

  // Generated Variants list
  const [variants, setVariants] = useState<any[]>(
    initialProduct?.variants ?? [],
  );

  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Option input state
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionValue, setNewOptionValue] = useState("");

  // Cartesian product combinations for options
  const getCombinations = (
    opts: { name: string; values: string[] }[],
  ): string[][] => {
    const filtered = opts.filter(
      (o) => o.name.trim() !== "" && o.values.length > 0,
    );
    if (filtered.length === 0) return [];

    let result: string[][] = [[]];
    for (const option of filtered) {
      const next: string[][] = [];
      for (const res of result) {
        for (const val of option.values) {
          next.push([...res, val]);
        }
      }
      result = next;
    }
    return result;
  };

  // Re-generate combinations when options change
  useEffect(() => {
    if (!hasVariants) {
      setVariants([]);
      return;
    }

    const combos = getCombinations(options);
    const updatedVariants = combos.map((combo) => {
      const variantTitle = combo.join(" / ");
      // Check if this variant already exists in initial product
      const existing = variants.find((v) => v.title === variantTitle);

      return {
        id: existing?.id,
        title: variantTitle,
        option1: combo[0] ?? null,
        option2: combo[1] ?? null,
        option3: combo[2] ?? null,
        price: existing ? existing.price : Number(price) || 0,
        compareAtPrice: existing ? existing.compareAtPrice : Number(compareAtPrice) || null,
        sku: existing ? existing.sku : sku || "",
        inventoryQuantity: existing ? existing.inventoryQuantity : Number(inventoryQuantity) || 0,
        imageUrl: existing ? existing.imageUrl : images[0] || "",
      };
    });

    setVariants(updatedVariants);
  }, [options, hasVariants]);

  // Image Upload helper (base64 encode)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setImages((prev) => [...prev, reader.result as string]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddImageUrl = () => {
    if (newImageUrl.trim() === "") return;
    setImages((prev) => [...prev, newImageUrl.trim()]);
    setNewImageUrl("");
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Option Handlers
  const handleAddOption = () => {
    if (newOptionName.trim() === "") return;
    if (options.length >= 3) {
      setError("Maximum 3 options are allowed (Shopify limit)");
      return;
    }
    setOptions((prev) => [...prev, { name: newOptionName.trim(), values: [] }]);
    setNewOptionName("");
    setError("");
  };

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddOptionValue = (optionIndex: number, value: string) => {
    if (value.trim() === "") return;
    const updated = [...options];
    const values = updated[optionIndex]?.values ?? [];
    if (!values.includes(value.trim())) {
      values.push(value.trim());
      updated[optionIndex]!.values = values;
      setOptions(updated);
    }
  };

  const handleRemoveOptionValue = (optionIndex: number, valueIndex: number) => {
    const updated = [...options];
    const values = updated[optionIndex]?.values ?? [];
    updated[optionIndex]!.values = values.filter((_, i) => i !== valueIndex);
    setOptions(updated);
  };

  // Variant Field Change Handlers
  const handleVariantChange = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    const updated = [...variants];
    if (updated[index]) {
      updated[index][field] = value;
      setVariants(updated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Product title is required");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      let finalVariants: any[] = [];
      if (hasVariants) {
        if (variants.length === 0) {
          throw new Error("Please add options and values to generate variants.");
        }
        finalVariants = variants;
      } else {
        // Create single default variant
        finalVariants = [
          {
            id: initialProduct?.variants?.[0]?.id,
            title: "Default Title",
            price: Number(price) || 0,
            compareAtPrice: Number(compareAtPrice) || null,
            sku: sku || null,
            inventoryQuantity: Number(inventoryQuantity) || 0,
            imageUrl: images[0] || null,
          },
        ];
      }

      const input = {
        id: initialProduct?.id,
        title,
        description,
        category,
        status,
        images,
        options: hasVariants ? options : [],
        variants: finalVariants,
      };

      if (isEditing) {
        await updateProductMutation.mutateAsync(input);
      } else {
        await createProductMutation.mutateAsync(input);
      }
      onSave();
    } catch (err: any) {
      setError(err?.message ?? "An error occurred while saving the product");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isEditing ? "Edit Product" : "Add Product"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isEditing ? "Modify your product catalog details" : "Add a new product to your inventory"}
          </p>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Product"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border-destructive/20 text-destructive flex items-center gap-3 rounded-2xl border p-4 text-sm shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main Column */}
        <div className="space-y-6">
          {/* Card: Details */}
          <div className="bg-card rounded-[28px] border p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold tracking-tight">
              Product Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                  Title
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Premium Black Panjabi"
                  className="rounded-xl border bg-background/50 focus:bg-background"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                  Category
                </label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Shirts, Panjabi, Sandals"
                  className="rounded-xl border bg-background/50 focus:bg-background"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your product benefits, fabric, sizes, and specs..."
                  rows={5}
                  className="placeholder:text-muted-foreground border-input ring-offset-background focus-visible:ring-ring bg-background/50 focus:bg-background w-full rounded-xl border px-3.5 py-3 text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>

          {/* Card: Media */}
          <div className="bg-card rounded-[28px] border p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold tracking-tight">
              Media
            </h3>
            <p className="text-muted-foreground mb-4 text-xs leading-5">
              Add product images by URL or upload files. Uploaded files are encoded as Base64 for instant search tests.
            </p>

            <div className="grid gap-4">
              <div className="flex gap-2">
                <Input
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="Paste image URL here..."
                  className="rounded-xl border bg-background/50 focus:bg-background"
                />
                <Button type="button" onClick={handleAddImageUrl}>
                  Add URL
                </Button>
              </div>

              <div className="flex items-center justify-center rounded-2xl border-2 border-dashed bg-background/50 p-6 text-center hover:bg-background transition-colors relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <div className="space-y-1.5">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div className="text-sm font-medium">
                    Upload image from device
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Drag and drop or click to choose file
                  </div>
                </div>
              </div>

              {/* Gallery Grid */}
              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {images.map((url, idx) => (
                    <div
                      key={idx}
                      className="group bg-background relative aspect-square overflow-hidden rounded-2xl border shadow-sm"
                    >
                      <img
                        src={url}
                        alt={`Preview ${idx}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="bg-destructive text-destructive-foreground absolute right-2 top-2 rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {idx === 0 && (
                        <span className="bg-primary text-primary-foreground absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          Cover
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Options & Variants Selector */}
          <div className="bg-card rounded-[28px] border p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">
                Options & Variants
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasVariants"
                  checked={hasVariants}
                  onChange={(e) => setHasVariants(e.target.checked)}
                  className="accent-primary h-4 w-4 rounded"
                />
                <label
                  htmlFor="hasVariants"
                  className="text-sm font-semibold cursor-pointer"
                >
                  This product has variations (e.g. Size, Color)
                </label>
              </div>
            </div>

            {hasVariants && (
              <div className="mt-6 space-y-6">
                <Separator />
                {/* Options Builder */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold tracking-tight text-foreground">
                    Define Options
                  </h4>

                  {options.map((opt, optIdx) => (
                    <div
                      key={optIdx}
                      className="bg-background flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground">
                          Option {optIdx + 1}: {opt.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveOption(optIdx)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {opt.values.map((val, valIdx) => (
                          <span
                            key={valIdx}
                            className="bg-secondary text-secondary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border"
                          >
                            {val}
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveOptionValue(optIdx, valIdx)
                              }
                              className="text-muted-foreground hover:text-foreground font-bold"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Input
                          placeholder="Add value (e.g. Red, XL)..."
                          id={`opt-val-input-${optIdx}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const inputEl = e.currentTarget as HTMLInputElement;
                              handleAddOptionValue(optIdx, inputEl.value);
                              inputEl.value = "";
                            }
                          }}
                          className="rounded-xl border bg-background/50 focus:bg-background text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const inputEl = document.getElementById(
                              `opt-val-input-${optIdx}`,
                            ) as HTMLInputElement;
                            if (inputEl) {
                              handleAddOptionValue(optIdx, inputEl.value);
                              inputEl.value = "";
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}

                  {options.length < 3 && (
                    <div className="flex items-center gap-3">
                      <Input
                        value={newOptionName}
                        onChange={(e) => setNewOptionName(e.target.value)}
                        placeholder="Option name (e.g. Size, Color)..."
                        className="rounded-xl border bg-background/50 focus:bg-background"
                      />
                      <Button
                        type="button"
                        onClick={handleAddOption}
                        variant="outline"
                        className="shrink-0"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Add Option
                      </Button>
                    </div>
                  )}
                </div>

                {variants.length > 0 && (
                  <>
                    <Separator />
                    {/* Variants list editor */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold tracking-tight text-foreground">
                        Configure Variants ({variants.length})
                      </h4>
                      <div className="overflow-x-auto rounded-2xl border">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/40 text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                              <th className="p-3">Variant</th>
                              <th className="p-3">Price</th>
                              <th className="p-3">Compare At</th>
                              <th className="p-3">SKU</th>
                              <th className="p-3">Inventory</th>
                              <th className="p-3">Image URL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((v, idx) => (
                              <tr key={idx} className="border-b hover:bg-muted/10">
                                <td className="p-3 text-sm font-semibold text-foreground">
                                  {v.title}
                                </td>
                                <td className="p-3">
                                  <Input
                                    type="number"
                                    value={v.price}
                                    onChange={(e) =>
                                      handleVariantChange(
                                        idx,
                                        "price",
                                        Number(e.target.value) || 0,
                                      )
                                    }
                                    className="h-8 max-w-[100px] text-xs rounded-lg"
                                  />
                                </td>
                                <td className="p-3">
                                  <Input
                                    type="number"
                                    value={v.compareAtPrice ?? ""}
                                    onChange={(e) =>
                                      handleVariantChange(
                                        idx,
                                        "compareAtPrice",
                                        e.target.value
                                          ? Number(e.target.value)
                                          : "",
                                      )
                                    }
                                    className="h-8 max-w-[100px] text-xs rounded-lg"
                                  />
                                </td>
                                <td className="p-3">
                                  <Input
                                    value={v.sku ?? ""}
                                    onChange={(e) =>
                                      handleVariantChange(
                                        idx,
                                        "sku",
                                        e.target.value,
                                      )
                                    }
                                    className="h-8 max-w-[120px] text-xs rounded-lg"
                                  />
                                </td>
                                <td className="p-3">
                                  <Input
                                    type="number"
                                    value={v.inventoryQuantity}
                                    onChange={(e) =>
                                      handleVariantChange(
                                        idx,
                                        "inventoryQuantity",
                                        Number(e.target.value) || 0,
                                      )
                                    }
                                    className="h-8 max-w-[80px] text-xs rounded-lg"
                                  />
                                </td>
                                <td className="p-3">
                                  <select
                                    value={v.imageUrl ?? ""}
                                    onChange={(e) =>
                                      handleVariantChange(
                                        idx,
                                        "imageUrl",
                                        e.target.value,
                                      )
                                    }
                                    className="border-input bg-background/50 h-8 max-w-[120px] rounded-lg border px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                                  >
                                    <option value="">None</option>
                                    {images.map((img, i) => (
                                      <option key={i} value={img}>
                                        Image {i + 1}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {!hasVariants && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wider">
                    Price
                  </label>
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="1850"
                    className="rounded-xl border bg-background/50 focus:bg-background"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wider">
                    Compare At Price
                  </label>
                  <Input
                    type="number"
                    value={compareAtPrice}
                    onChange={(e) => setCompareAtPrice(e.target.value)}
                    placeholder="2200"
                    className="rounded-xl border bg-background/50 focus:bg-background"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wider">
                    SKU
                  </label>
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="PANJABI-BLK-M"
                    className="rounded-xl border bg-background/50 focus:bg-background"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wider">
                    Inventory Qty
                  </label>
                  <Input
                    type="number"
                    value={inventoryQuantity}
                    onChange={(e) => setInventoryQuantity(e.target.value)}
                    placeholder="50"
                    className="rounded-xl border bg-background/50 focus:bg-background"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Status Column */}
        <div className="space-y-6">
          <div className="bg-card rounded-[28px] border p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold tracking-tight">
              Publishing
            </h3>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                Product status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="border-input bg-background/50 focus:bg-background h-10 w-full rounded-xl border px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <Separator className="my-5" />
            <div className="text-muted-foreground text-xs leading-5">
              Active products are immediately available for automated customer recommendations and stock validation in the Meta AI Chat Employee.
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
