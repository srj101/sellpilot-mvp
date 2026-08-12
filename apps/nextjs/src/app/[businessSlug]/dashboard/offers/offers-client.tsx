"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  Save,
  Sparkles,
  BadgePercent,
  Lock,
  ArrowUpRight,
  Megaphone,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Card, CardContent } from "@acme/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@acme/ui/dialog";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { useBusinessSlug } from "~/hooks/use-business-slug";
import { usePermissions } from "~/hooks/use-permissions";

interface Offer {
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
  comboProductAId?: string | null;
  comboProductBId?: string | null;
  isCampaign: boolean;
}

const fieldClass =
  "flex h-9 w-full rounded-md border bg-muted/40 px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

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

function isOfferLive(o: Pick<Offer, "active" | "endDate">) {
  return o.active && (!o.endDate || new Date(o.endDate) > new Date());
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

/** Two-click inline confirm instead of a blocking browser confirm() — reverts on its own
 * after a few seconds so a stray second click elsewhere can't leave it armed forever. */
function DeleteButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <Button
        size="sm"
        variant="destructive"
        className="h-8 gap-1 px-2 text-xs"
        disabled={pending}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        onBlur={() => setArmed(false)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Confirm?
      </Button>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-muted-foreground hover:bg-rose-500/5 hover:text-rose-500"
      onClick={() => {
        setArmed(true);
        setTimeout(() => setArmed(false), 4000);
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "neutral" | "positive" | "negative";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tone === "positive" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            tone === "negative" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            tone === "neutral" && "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function OffersClient({ initialOffers, canManage: planAllowsManage }: { initialOffers: Offer[]; canManage: boolean }) {
  const trpc = useTRPC();
  const businessSlug = useBusinessSlug();
  const { can } = usePermissions();
  // Plan tier gates the feature entirely; role permission gates each action per-member on top of that.
  const canCreate = planAllowsManage && can("offers", "create");
  const canEdit = planAllowsManage && can("offers", "edit");
  const canDelete = planAllowsManage && can("offers", "delete");
  const canManage = canCreate || canEdit || canDelete;
  const createMutation = useMutation(trpc.offers.create.mutationOptions());
  const updateMutation = useMutation(trpc.offers.update.mutationOptions());
  const deleteMutation = useMutation(trpc.offers.delete.mutationOptions());
  const { data: productsData } = useQuery(trpc.products.list.queryOptions());
  const products = useMemo(() => productsData?.products ?? [], [productsData]);
  const productNameById = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);

  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form dialog state
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
  const [isCombo, setIsCombo] = useState(false);
  const [comboProductAId, setComboProductAId] = useState("");
  const [comboProductBId, setComboProductBId] = useState("");
  const [isCampaign, setIsCampaign] = useState(false);

  const filtered = useMemo(() => {
    return offers.filter((o) => {
      if (filter === "active") return isOfferLive(o);
      if (filter === "expired") return !isOfferLive(o);
      return true;
    });
  }, [offers, filter]);

  const stats = useMemo(() => {
    const activeCount = offers.filter(isOfferLive).length;
    return { total: offers.length, active: activeCount, expired: offers.length - activeCount };
  }, [offers]);

  const handleCopy = (couponCode: string, id: string) => {
    void navigator.clipboard.writeText(couponCode);
    setCopiedId(id);
    toast.success("Coupon code copied");
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
    setIsCombo(false);
    setComboProductAId("");
    setComboProductBId("");
    setIsCampaign(false);
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
    setIsCombo(Boolean(o.comboProductAId && o.comboProductBId));
    setComboProductAId(o.comboProductAId ?? "");
    setComboProductBId(o.comboProductBId ?? "");
    setIsCampaign(o.isCampaign);
    setIsOpen(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCombo && (!comboProductAId || !comboProductBId)) {
      toast.error("Pick both products for a combo offer.");
      return;
    }
    if (isCombo && comboProductAId === comboProductBId) {
      toast.error("Combo products must be two different products.");
      return;
    }
    const comboFields = {
      comboProductAId: isCombo ? comboProductAId : null,
      comboProductBId: isCombo ? comboProductBId : null,
    };
    try {
      if (editingOffer) {
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
          ...comboFields,
          isCampaign,
        });
        setOffers(offers.map((o) => (o.id === editingOffer.id ? (updated as unknown as Offer) : o)));
        toast.success("Offer updated");
      } else {
        const created = await createMutation.mutateAsync({
          title,
          code: code || null,
          description: description || null,
          type,
          value,
          minSubtotal,
          endDate: endDate ? new Date(endDate) : null,
          active,
          ...comboFields,
          isCampaign,
        });
        setOffers([created as unknown as Offer, ...offers]);
        toast.success("Offer created");
      }
      setIsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save offer");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id });
      setOffers(offers.filter((o) => o.id !== id));
      toast.success("Offer deleted");
    } catch {
      toast.error("Failed to delete offer");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Offers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage discount codes and combo/bundle deals.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreateModal} size="sm" className="rounded-lg shadow-sm gap-1.5">
            <Plus className="h-4 w-4" /> Create Offer
          </Button>
        ) : !planAllowsManage ? (
          <Link href={`/${businessSlug}/dashboard/pricing`}>
            <Button size="sm" variant="outline" className="rounded-lg gap-1.5">
              <Lock className="h-4 w-4" /> Upgrade to Pro
            </Button>
          </Link>
        ) : null}
      </div>

      {!planAllowsManage && (
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Campaign &amp; Promo Automation is a Pro feature. You can see offers already created, but creating, editing, or deleting them needs an upgrade.</span>
            </div>
            <Link href={`/${businessSlug}/dashboard/pricing`}>
              <Button size="sm" variant="ghost" className="gap-1 shrink-0">
                Upgrade plan
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={BadgePercent} label="Total Offers" value={stats.total} tone="neutral" />
        <StatCard icon={CheckCircle2} label="Active" value={stats.active} tone="positive" />
        <StatCard icon={XCircle} label="Expired" value={stats.expired} tone="negative" />
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
            {offers.length === 0 ? "No offers yet" : "No offers match this filter"}
          </p>
          {offers.length === 0 && canCreate && (
            <Button onClick={openCreateModal} size="sm" className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" /> Create your first offer
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const isCombo = Boolean(o.comboProductAId && o.comboProductBId);
            const isActive = isOfferLive(o);
            const discountLabel =
              o.type === "percentage" ? `${o.value}% OFF` : `${formatCurrency(o.value)} OFF`;
            const comboLabelA = o.comboProductAId ? (productNameById.get(o.comboProductAId) ?? "Product A") : "Product A";
            const comboLabelB = o.comboProductBId ? (productNameById.get(o.comboProductBId) ?? "Product B") : "Product B";

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
                        isCombo
                          ? "bg-primary/10 text-primary"
                          : o.type === "percentage"
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      )}
                    >
                      {isCombo ? (
                        <Sparkles className="h-4 w-4" />
                      ) : o.type === "percentage" ? (
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
                  {o.isCampaign && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      <Megaphone className="h-3 w-3" />
                      Campaign — AI mentions this proactively
                    </div>
                  )}
                  {o.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {o.description}
                    </p>
                  )}

                  {isCombo ? (
                    <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {comboLabelA} + {comboLabelB}
                      </span>
                    </div>
                  ) : (
                    o.code && (
                      <div className="mt-3 flex items-center gap-2">
                        <code className="flex-1 rounded-lg border border-dashed bg-muted/50 px-3 py-1.5 text-center text-xs font-mono font-bold tracking-widest text-foreground">
                          {o.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(o.code ?? "", o.id)}
                          className="shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="ml-1 text-xs">
                            {copiedId === o.id ? "Copied!" : "Copy"}
                          </span>
                        </Button>
                      </div>
                    )
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

                {canManage && (
                <div className="mt-6 pt-4 border-t flex items-center justify-end gap-2">
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditModal(o)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <DeleteButton pending={deleteMutation.isPending} onConfirm={() => handleDelete(o.id)} />
                  )}
                </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* p-0 + manual per-section padding (instead of scrollBody) so the header and the
            footer stay pinned and only the middle field area scrolls — the footer lives
            inside the <form> for onSubmit, which DialogContent can't see past to keep it
            out of a single all-children scroll wrapper. */}
        <DialogContent className="flex max-h-[90dvh] flex-col p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
            <DialogTitle className="text-xl">{editingOffer ? "Edit Offer" : "Create Offer"}</DialogTitle>
            <DialogDescription>
              {editingOffer ? "Update this offer's details." : "Set up a discount code or an automatic combo deal."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="scrollbar-thin min-h-0 flex-1 space-y-8 overflow-y-auto px-6 pb-2 sm:px-8">
            <div className="space-y-4">
              <SectionLabel>Details</SectionLabel>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="offer-title">Offer Title</Label>
                  <Input
                    id="offer-title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Eid Campaign Discount"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="offer-desc">Description</Label>
                  <textarea
                    id="offer-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of terms..."
                    className={cn(fieldClass, "h-auto resize-none py-2.5")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionLabel>Discount</SectionLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="offer-type">Discount Type</Label>
                  <select
                    id="offer-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as "percentage" | "fixed")}
                    className={fieldClass}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (৳)</option>
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
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="offer-min">Min. Subtotal (৳)</Label>
                  <Input
                    id="offer-min"
                    type="number"
                    min={0}
                    value={minSubtotal}
                    onChange={(e) => setMinSubtotal(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionLabel>How It's Claimed</SectionLabel>
              <div className={cn("space-y-3 rounded-xl border p-4 transition-colors", isCombo && "border-primary/30 bg-primary/5")}>
                <div className="flex items-start gap-2.5">
                  <input
                    id="offer-combo"
                    type="checkbox"
                    checked={isCombo}
                    onChange={(e) => {
                      setIsCombo(e.target.checked);
                      if (e.target.checked) setCode("");
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="offer-combo" className="flex items-center gap-1.5 text-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Combo offer
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Applies automatically when both products are bought together — no code needed.
                    </p>
                  </div>
                </div>
                {isCombo && (
                  <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="offer-combo-a">Product A</Label>
                      <select
                        id="offer-combo-a"
                        value={comboProductAId}
                        onChange={(e) => setComboProductAId(e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">Select a product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="offer-combo-b">Product B</Label>
                      <select
                        id="offer-combo-b"
                        value={comboProductBId}
                        onChange={(e) => setComboProductBId(e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">Select a product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {!isCombo && (
                <div className="space-y-1.5">
                  <Label htmlFor="offer-code">Coupon Code (Optional)</Label>
                  <Input
                    id="offer-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. EID500"
                    className="font-mono tracking-wider"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for a discount that applies automatically at checkout.</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <SectionLabel>Availability</SectionLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="offer-end">Expiry Date (Optional)</Label>
                  <Input
                    id="offer-end"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border p-3 sm:h-9 sm:border-0 sm:p-0">
                  <input
                    id="offer-active"
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="offer-active">Offer is active and claimable</Label>
                </div>
              </div>
              <div className={cn("flex items-start gap-2.5 rounded-xl border p-4 transition-colors", isCampaign && "border-amber-500/30 bg-amber-500/5")}>
                <input
                  id="offer-campaign"
                  type="checkbox"
                  checked={isCampaign}
                  onChange={(e) => setIsCampaign(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="offer-campaign" className="flex items-center gap-1.5 text-foreground">
                    <Megaphone className="h-3.5 w-3.5 text-amber-500" />
                    Feature as campaign
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The AI will proactively bring this up early in conversations (e.g. a festival/seasonal
                    promo), instead of waiting for the customer to ask or type a code. Available on Growth
                    (shown to repeat customers only) and Pro (shown to everyone).
                  </p>
                </div>
              </div>
            </div>
            </div>

            <DialogFooter className="shrink-0 border-t px-6 py-5 sm:px-8">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5" disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : editingOffer ? "Update Offer" : "Create Offer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
