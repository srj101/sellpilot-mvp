"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Percent,
  Tag,
  Calendar,
  CheckCircle2,
  XCircle,
  Copy,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@acme/ui/card";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";

type Offer = {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  type: string;
  value: number;
  minSubtotal: number;
  startDate: Date | string;
  endDate: Date | string | null;
  active: boolean;
  createdAt: Date | string;
};

function formatCurrency(amount: number) {
  return `৳${amount.toLocaleString()}`;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export function OffersClient({ initialOffers }: { initialOffers: Offer[] }) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.offers.create.mutationOptions());
  const updateMutation = useMutation(trpc.offers.update.mutationOptions());
  const deleteMutation = useMutation(trpc.offers.delete.mutationOptions());

  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form modal state
  const [isOpen, setIsOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  // Form inputs state
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState(10);
  const [minSubtotal, setMinSubtotal] = useState(0);
  const [endDate, setEndDate] = useState("");
  const [active, setActive] = useState(true);

  const filtered = useMemo(() => {
    const now = new Date();
    return offers.filter((o) => {
      const isAct = o.active && (!o.endDate || new Date(o.endDate) > now);
      if (filter === "active") return isAct;
      if (filter === "expired") return !isAct;
      return true;
    });
  }, [offers, filter]);

  const stats = useMemo(() => {
    const now = new Date();
    const activeCount = offers.filter(
      (o) => o.active && (!o.endDate || new Date(o.endDate) > now),
    ).length;
    const expiredCount = offers.length - activeCount;
    return { total: offers.length, active: activeCount, expired: expiredCount };
  }, [offers]);

  const handleCopy = (couponCode: string, id: string) => {
    copyToClipboard(couponCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCreateModal = () => {
    setEditingOffer(null);
    setTitle("");
    setCode("");
    setDescription("");
    setType("percentage");
    setValue(10);
    setMinSubtotal(0);
    setEndDate("");
    setActive(true);
    setIsOpen(true);
  };

  const openEditModal = (o: Offer) => {
    setEditingOffer(o);
    setTitle(o.title);
    setCode(o.code ?? "");
    setDescription(o.description ?? "");
    setType(o.type as "percentage" | "fixed");
    setValue(o.value);
    setMinSubtotal(o.minSubtotal);
    setEndDate(o.endDate ? new Date(o.endDate).toISOString().slice(0, 16) : "");
    setActive(o.active);
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOffer) {
        // Update
        const updated = await updateMutation.mutateAsync({
          id: editingOffer.id,
          title,
          code: code || null,
          description: description || null,
          type,
          value,
          minSubtotal,
          endDate: endDate ? new Date(endDate) : null,
          active,
        });
        setOffers(offers.map((o) => (o.id === editingOffer.id ? (updated as unknown as Offer) : o)));
      } else {
        // Create
        const created = await createMutation.mutateAsync({
          title,
          code: code || null,
          description: description || null,
          type,
          value,
          minSubtotal,
          endDate: endDate ? new Date(endDate) : null,
          active,
        });
        setOffers([created as unknown as Offer, ...offers]);
      }
      setIsOpen(false);
    } catch (err) {
      alert("Failed to save offer");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this offer?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        setOffers(offers.filter((o) => o.id !== id));
      } catch (err) {
        alert("Failed to delete offer");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Offers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage discount codes and promotional offers.
          </p>
        </div>
        <Button onClick={openCreateModal} size="sm" className="rounded-lg shadow-sm gap-1">
          <Plus className="h-4 w-4" /> Create Offer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Offers", value: stats.total, color: "from-violet-500/10 to-violet-600/5 dark:from-violet-500/20 dark:to-violet-600/10", text: "text-violet-600 dark:text-violet-400" },
          { label: "Active", value: stats.active, color: "from-emerald-500/10 to-emerald-600/5 dark:from-emerald-500/20 dark:to-emerald-600/10", text: "text-emerald-600 dark:text-emerald-400" },
          { label: "Expired", value: stats.expired, color: "from-rose-500/10 to-rose-600/5 dark:from-rose-500/20 dark:to-rose-600/10", text: "text-rose-600 dark:text-rose-400" },
        ].map((s) => (
          <Card
            key={s.label}
            className={cn(
              "rounded-2xl border bg-gradient-to-br p-4 shadow-sm",
              s.color,
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", s.text)}>
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {(["all", "active", "expired"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs capitalize h-8 rounded-lg"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Offers Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16">
          <Percent className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No offers found
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const now = new Date();
            const isActive = o.active && (!o.endDate || new Date(o.endDate) > now);
            const discountLabel =
              o.type === "percentage" ? `${o.value}% OFF` : `${formatCurrency(o.value)} OFF`;

            return (
              <Card
                key={o.id}
                className={cn(
                  "group relative overflow-hidden flex flex-col justify-between p-5 transition-all card-hover",
                  !isActive && "opacity-60",
                )}
              >
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold",
                        o.type === "percentage"
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      )}
                    >
                      {o.type === "percentage" ? (
                        <Percent className="h-4 w-4" />
                      ) : (
                        <Tag className="h-4 w-4" />
                      )}
                      {discountLabel}
                    </div>
                    {isActive ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Expired
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold text-foreground">{o.title}</h3>
                  {o.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {o.description}
                    </p>
                  )}

                  {o.code && (
                    <div className="mt-3 flex items-center gap-2">
                      <code className="flex-1 rounded-lg border border-dashed bg-muted/50 px-3 py-1.5 text-center text-xs font-mono font-bold tracking-widest text-foreground">
                        {o.code}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(o.code!, o.id)}
                        className="shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                        <span className="ml-1 text-xs">
                          {copiedId === o.id ? "Copied!" : "Copy"}
                        </span>
                      </Button>
                    </div>
                  )}

                  <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                    {o.minSubtotal > 0 && (
                      <p>Min. order: {formatCurrency(o.minSubtotal)}</p>
                    )}
                    <p className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-primary" />
                      {formatDate(o.startDate)}
                      {o.endDate && ` – ${formatDate(o.endDate)}`}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t flex items-center justify-end gap-2">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditModal(o)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5" onClick={() => handleDelete(o.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Form Modal overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg shadow-2xl relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <form onSubmit={handleSave}>
              <CardHeader>
                <CardTitle>{editingOffer ? "Edit Offer" : "Create Offer"}</CardTitle>
                <CardDescription>Configure promotional code details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="offer-title">Offer Title</Label>
                  <Input
                    id="offer-title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Eid Campaign Discount"
                    className="rounded-lg"
                  />
                </div>

                {/* Coupon Code */}
                <div className="space-y-1.5">
                  <Label htmlFor="offer-code">Coupon Code (Optional)</Label>
                  <Input
                    id="offer-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. EID500"
                    className="rounded-lg font-mono tracking-wider"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="offer-desc">Description</Label>
                  <Input
                    id="offer-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of terms..."
                    className="rounded-lg"
                  />
                </div>

                {/* Type & Value */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="offer-type">Discount Type</Label>
                    <select
                      id="offer-type"
                      value={type}
                      onChange={(e) => setType(e.target.value as "percentage" | "fixed")}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="percentage">Percentage OFF (%)</option>
                      <option value="fixed">Fixed BDT OFF (৳)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="offer-value">Discount Value</Label>
                    <Input
                      id="offer-value"
                      type="number"
                      required
                      min={1}
                      value={value}
                      onChange={(e) => setValue(Number(e.target.value))}
                      className="rounded-lg"
                    />
                  </div>
                </div>

                {/* Min Subtotal */}
                <div className="space-y-1.5">
                  <Label htmlFor="offer-min">Minimum Subtotal Required (৳)</Label>
                  <Input
                    id="offer-min"
                    type="number"
                    min={0}
                    value={minSubtotal}
                    onChange={(e) => setMinSubtotal(Number(e.target.value))}
                    className="rounded-lg"
                  />
                </div>

                {/* End Date */}
                <div className="space-y-1.5">
                  <Label htmlFor="offer-end">Expiry Date (Optional)</Label>
                  <Input
                    id="offer-end"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-lg"
                  />
                </div>

                {/* Active Toggle */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    id="offer-active"
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="offer-active">Offer is Active and claimable</Label>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="rounded-lg">
                  Cancel
                </Button>
                <Button type="submit" className="rounded-lg gap-1.5">
                  <Save className="h-4 w-4" />
                  {editingOffer ? "Update Offer" : "Create Offer"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
