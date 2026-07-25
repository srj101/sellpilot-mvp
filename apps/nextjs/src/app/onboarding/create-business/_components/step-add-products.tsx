"use client";

import {
  PackagePlus,
  FileDown,
  UploadCloud,
  Star,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Papa from "papaparse";

import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { OnboardingShell } from "./onboarding-shell";

interface DraftProduct {
  name: string;
  category: string;
  price: number;
  discountPercent?: number;
  stockQty: number;
  colour: string;
  size: string;
  rating?: number;
  description: string;
  image: string | null;
}

interface BulkRow {
  title: string;
  category?: string;
  price: number;
  discountPercent?: number;
  stockQty: number;
  description?: string;
  rating?: number;
  imageUrl?: string;
}

const EMPTY_DRAFT: DraftProduct = {
  name: "",
  category: "",
  price: 0,
  discountPercent: undefined,
  stockQty: 0,
  colour: "",
  size: "",
  rating: undefined,
  description: "",
  image: null,
};

function toProductInput(p: DraftProduct) {
  const options = [
    p.colour ? { name: "Color", values: [p.colour] } : null,
    p.size ? { name: "Size", values: [p.size] } : null,
  ].filter((o): o is { name: string; values: string[] } => o !== null);

  const variantTitle = [p.colour, p.size].filter(Boolean).join(" / ") || "Default";
  const compareAtPrice = p.discountPercent
    ? Math.round(p.price / (1 - p.discountPercent / 100))
    : undefined;

  return {
    title: p.name,
    description: p.description || undefined,
    category: p.category || undefined,
    status: "active",
    images: p.image ? [p.image] : [],
    options,
    rating: p.rating,
    variants: [
      {
        title: variantTitle,
        option1: p.colour || undefined,
        option2: p.size || undefined,
        price: p.price,
        compareAtPrice,
        inventoryQuantity: p.stockQty,
        imageUrl: p.image || undefined,
      },
    ],
  };
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          className="p-0.5"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "h-5 w-5 transition-colors",
              n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}

const FIELD_CLASS =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function StepAddProducts({ businessSlug, onNext }: { businessSlug: string; onNext: () => void }) {
  const [tab, setTab] = useState<"manual" | "csv">("manual");
  const trpc = useTRPC();
  const createProduct = useMutation(trpc.products.create.mutationOptions());
  const bulkCreate = useMutation(trpc.products.bulkCreate.mutationOptions());

  // ── Manual entry state ──────────────────────────────────────────
  const [draft, setDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [queued, setQueued] = useState<DraftProduct[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  function updateDraft<K extends keyof DraftProduct>(key: K, value: DraftProduct[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") updateDraft("image", reader.result);
    };
    reader.readAsDataURL(file);
  }

  function addToQueue() {
    if (!draft.name.trim() || !draft.price) return;
    setQueued((prev) => [...prev, { ...draft, name: draft.name.trim() }]);
    setDraft(EMPTY_DRAFT);
  }

  function removeFromQueue(index: number) {
    setQueued((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveAndContinue() {
    const toSave = [...queued];
    if (draft.name.trim() && draft.price) {
      toSave.push({ ...draft, name: draft.name.trim() });
    }
    if (toSave.length === 0) {
      onNext();
      return;
    }

    setIsSaving(true);
    const remaining: DraftProduct[] = [];
    const errors: string[] = [];

    for (const p of toSave) {
      try {
        await createProduct.mutateAsync(toProductInput(p));
      } catch (err) {
        remaining.push(p);
        errors.push(`${p.name}: ${err instanceof Error ? err.message : "Failed to save"}`);
      }
    }

    setIsSaving(false);
    setQueued(remaining);
    setSaveErrors(errors);
    setDraft(EMPTY_DRAFT);

    if (remaining.length === 0) onNext();
  }

  // ── CSV import state ────────────────────────────────────────────
  const [csvRows, setCsvRows] = useState<BulkRow[]>([]);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function pick(row: Record<string, string>, ...keys: string[]) {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return undefined;
  }

  function parseCsv(file: File) {
    setCsvError(null);
    setCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: BulkRow[] = [];
        let skipped = 0;
        for (const row of results.data) {
          const title = pick(row, "title", "Title", "name", "Name")?.trim();
          const priceRaw = pick(row, "price", "Price");
          const price = Number(priceRaw);
          if (!title || !priceRaw || Number.isNaN(price) || price <= 0) {
            skipped++;
            continue;
          }
          const discountRaw = pick(row, "discountPercent", "Discount%", "discount");
          const ratingRaw = pick(row, "rating", "Rating");
          rows.push({
            title,
            category: pick(row, "category", "Category"),
            price,
            discountPercent: discountRaw ? Number(discountRaw) : undefined,
            stockQty: Number(pick(row, "stockQty", "Stock Qty", "stock") ?? 0) || 0,
            description: pick(row, "description", "Description"),
            rating: ratingRaw ? Number(ratingRaw) : undefined,
            imageUrl: pick(row, "imageUrl", "Image", "image"),
          });
        }

        if (rows.length > 500) {
          setCsvError(
            `This file has ${rows.length} valid rows — the limit is 500 per import. Please split it into multiple files.`,
          );
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
    const header = "title,category,price,discountPercent,stockQty,description,rating,imageUrl\n";
    const sample =
      "Classic White T-Shirt,Fashion & Apparel,500,10,25,100% cotton crewneck tee,,https://example.com/tshirt.jpg\n";
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
      await bulkCreate.mutateAsync({ products: csvRows });
      onNext();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Import failed — please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <OnboardingShell
      current="products"
      title="Add your first products"
      description="The AI agent needs to know what you sell so it can answer customer questions and take orders."
      maxWidthClassName="max-w-2xl"
    >
      <div className="space-y-6">
          <div className="flex border-b border-border">
            <button
              onClick={() => setTab("manual")}
              className={`pb-3 px-1 mr-8 font-medium text-sm border-b-2 transition-colors ${tab === "manual" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => setTab("csv")}
              className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${tab === "csv" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              CSV Bulk Import
            </button>
          </div>

          {tab === "manual" ? (
            <div className="space-y-6">
              <div className="rounded-xl border p-6 bg-card text-card-foreground shadow-sm space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product Name</label>
                    <input
                      value={draft.name}
                      onChange={(e) => updateDraft("name", e.target.value)}
                      placeholder="e.g. Classic White T-Shirt"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <input
                      value={draft.category}
                      onChange={(e) => updateDraft("category", e.target.value)}
                      placeholder="e.g. Fashion & Apparel"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Price</label>
                    <input
                      type="number"
                      value={draft.price || ""}
                      onChange={(e) => updateDraft("price", Number(e.target.value))}
                      placeholder="e.g. 500"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Discount %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.discountPercent ?? ""}
                      onChange={(e) => updateDraft("discountPercent", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 10"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Stock Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={draft.stockQty || ""}
                      onChange={(e) => updateDraft("stockQty", Number(e.target.value))}
                      placeholder="e.g. 25"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Colour</label>
                    <input
                      value={draft.colour}
                      onChange={(e) => updateDraft("colour", e.target.value)}
                      placeholder="e.g. White"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Size</label>
                    <input
                      value={draft.size}
                      onChange={(e) => updateDraft("size", e.target.value)}
                      placeholder="e.g. M"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Rating</label>
                  <StarPicker value={draft.rating ?? 0} onChange={(n) => updateDraft("rating", n || undefined)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    rows={3}
                    value={draft.description}
                    onChange={(e) => updateDraft("description", e.target.value)}
                    placeholder="Briefly describe the product..."
                    className={cn(FIELD_CLASS, "resize-none")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Image</label>
                  <div className="flex items-center gap-3">
                    {draft.image && (
                      <img src={draft.image} alt="" className="h-14 w-14 rounded-md border object-cover" />
                    )}
                    <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                      {draft.image ? "Change image" : "Upload image"}
                      <input type="file" accept="image/*" className="sr-only" onChange={handleImageUpload} />
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={addToQueue}
                    disabled={!draft.name.trim() || !draft.price}
                    className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <PackagePlus className="h-4 w-4" />
                    Add Another
                  </button>
                </div>
              </div>

              {queued.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{queued.length} product{queued.length > 1 ? "s" : ""} ready to save</p>
                  {queued.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        {p.image && <img src={p.image} alt="" className="h-9 w-9 rounded-md border object-cover" />}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.price} {[p.colour, p.size].filter(Boolean).join(" / ")}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => removeFromQueue(i)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {saveErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1">
                  <p className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> Some products couldn't be saved</p>
                  {saveErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  "rounded-xl border border-dashed p-12 bg-card text-card-foreground flex flex-col items-center justify-center text-center space-y-4 transition-colors",
                  isDragging && "border-primary bg-primary/5",
                )}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Upload CSV File</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    Drag and drop your spreadsheet here or click to browse files. Colour/size variants aren't
                    supported via CSV yet — use Manual Entry for those. Image URLs must be publicly reachable.
                  </p>
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <FileDown className="h-4 w-4" />
                    Download Template
                  </button>
                  <label className="cursor-pointer rounded-lg bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors">
                    Browse Files
                    <input type="file" accept=".csv" className="sr-only" onChange={handleFileInput} />
                  </label>
                </div>
                {csvFileName && <p className="text-xs text-muted-foreground">Loaded: {csvFileName}</p>}
              </div>

              {csvError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {csvError}
                </div>
              )}

              {csvRows.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {csvRows.length} valid row{csvRows.length > 1 ? "s" : ""}
                    {csvSkipped > 0 ? ` — ${csvSkipped} skipped (missing title/price)` : ""}
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Title</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Price</th>
                          <th className="px-3 py-2">Discount%</th>
                          <th className="px-3 py-2">Stock</th>
                          <th className="px-3 py-2">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 20).map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{r.title}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.category ?? "—"}</td>
                            <td className="px-3 py-2">{r.price}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.discountPercent ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.stockQty}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.rating ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 20 && (
                    <p className="text-xs text-muted-foreground">+{csvRows.length - 20} more not shown</p>
                  )}
                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Import {csvRows.length} Product{csvRows.length > 1 ? "s" : ""}
                  </button>
                </div>
              )}
            </div>
          )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        {saveErrors.length > 0 ? (
          <button onClick={onNext} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Skip remaining & Continue →
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={tab === "manual" ? handleSaveAndContinue : onNext}
          disabled={isSaving}
          className="rounded-full bg-primary px-8 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === "manual" && (queued.length > 0 || draft.name.trim())
            ? "Save & Continue →"
            : "Skip for now →"}
        </button>
      </div>
    </OnboardingShell>
  );
}
