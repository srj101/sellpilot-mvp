"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  Truck,
  HelpCircle,
  FileText,
  Save,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  DollarSign,
  MapPin,
  Store,
  UploadCloud,
  Loader2,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Badge } from "@acme/ui/badge";

import { useTRPC } from "~/trpc/react";

type StoreProfile = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
};

type BusinessProfile = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  currency: string;
  defaultShippingCost: number;
  supportEmail: string | null;
  supportPhone: string | null;
} | null;

interface ShippingRate {
  id: string;
  district: string;
  cost: number;
  estimatedDays: number | null;
  active: boolean;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  tags: string[];
}

interface Policy {
  id: string;
  type: string;
  title: string;
  body: string;
  active: boolean;
}

interface SettingsClientProps {
  storeProfile: StoreProfile;
  profile: BusinessProfile;
  shippingRates: ShippingRate[];
  faqs: FAQ[];
  policies: Policy[];
}

/* ─── Section wrapper ──────────────────────────────────────────────── */
function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  defaultOpen = false,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-5 py-5">{children}</div>}
    </div>
  );
}

/* ─── Main settings component ──────────────────────────────────────── */
export function SettingsClient({
  storeProfile,
  profile,
  shippingRates,
  faqs,
  policies,
}: SettingsClientProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upsertProfile = useMutation(trpc.agent.upsertBusinessProfile.mutationOptions());
  const updateStore = useMutation(trpc.org.update.mutationOptions());
  const getUploadUrl = useMutation(trpc.org.getUploadUrl.mutationOptions());

  // Store Profile state
  const [storeName, setStoreName] = useState(storeProfile.name);
  const [storeDescription, setStoreDescription] = useState(storeProfile.metadata ?? "");
  const [storeLogo, setStoreLogo] = useState<string | null>(storeProfile.logo);

  // Business Profile state
  const [bpName, setBpName] = useState(profile?.name ?? "");
  const [bpDescription, setBpDescription] = useState(profile?.description ?? "");
  const [bpCurrency, setBpCurrency] = useState(profile?.currency ?? "BDT");
  const [bpShippingCost, setBpShippingCost] = useState(String(profile?.defaultShippingCost ?? 0));
  const [bpEmail, setBpEmail] = useState(profile?.supportEmail ?? "");
  const [bpPhone, setBpPhone] = useState(profile?.supportPhone ?? "");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Check if store profile inputs differ from database values to enable Save button
  const isStoreProfileDirty =
    storeName.trim() !== storeProfile.name ||
    storeDescription.trim() !== (storeProfile.metadata ?? "") ||
    storeLogo !== storeProfile.logo;

  const handleSaveStore = async () => {
    if (!storeName.trim()) {
      showToast("Store name cannot be empty");
      return;
    }
    setSaving("store");
    try {
      await updateStore.mutateAsync({
        name: storeName.trim(),
        description: storeDescription.trim() || undefined,
        logo: storeLogo,
      });
      showToast("Store profile updated successfully!");
      router.refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to update store profile");
    } finally {
      setSaving(null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Support standard image files
    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file");
      return;
    }

    setUploading(true);
    try {
      const res = await getUploadUrl.mutateAsync({
        contentType: file.type,
      });

      const uploadRes = await fetch(res.uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to write image data to storage");
      }

      setStoreLogo(res.publicUrl);
      showToast("Logo uploaded successfully!");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error uploading image to S3");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving("profile");
    try {
      await upsertProfile.mutateAsync({
        name: bpName,
        description: bpDescription,
        currency: bpCurrency,
        defaultShippingCost: Number(bpShippingCost),
        supportEmail: bpEmail,
        supportPhone: bpPhone,
      });
      showToast("Business profile saved!");
      router.refresh();
    } catch {
      showToast("Failed to save profile");
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Manage your business profile and AI agent context.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg">
          {toast}
        </div>
      )}

      {/* ─── Store Settings (Top Profile Section) ───────────────── */}
      <SettingsSection
        icon={Store}
        title="Store Profile"
        description="Configure your active store name, description, and display logo."
        defaultOpen={true}
      >
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Logo Upload Avatar */}
          <div className="flex flex-col items-center gap-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store Display Image</Label>
            <div className="relative group h-28 w-28 shrink-0 overflow-hidden rounded-2xl border bg-muted flex items-center justify-center shadow-inner">
              {storeLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={storeLogo} alt="Store logo" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center">
                  <Store className="h-8 w-8 text-muted-foreground/60 mx-auto" />
                  <span className="text-[10px] text-muted-foreground/50 font-bold block mt-1">No Image</span>
                </div>
              )}

              {/* Upload Overlay */}
              <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-all duration-200">
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <UploadCloud className="h-5 w-5 mb-0.5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Upload</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
            {uploading && (
              <span className="text-[10px] text-primary animate-pulse font-semibold">Uploading to S3...</span>
            )}
          </div>

          {/* Text fields */}
          <div className="flex-1 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="store-name">Store Name</Label>
                <Input
                  id="store-name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="My Store"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-slug">Store Handle (Slug)</Label>
                <Input
                  id="store-slug"
                  value={storeProfile.slug}
                  disabled
                  className="bg-muted text-muted-foreground cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-description">Store Description</Label>
              <textarea
                id="store-description"
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                placeholder="Describe your store profile..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveStore}
                disabled={!isStoreProfileDirty || saving === "store"}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving === "store" ? "Saving..." : "Save Store Profile"}
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* ─── Business Profile ──────────────────────────────────── */}
      <SettingsSection
        icon={Building2}
        title="Business Profile"
        description="Your store name, contact info, and defaults used by the AI agent."
        defaultOpen={false}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bp-name">Business Name</Label>
            <Input
              id="bp-name"
              value={bpName}
              onChange={(e) => setBpName(e.target.value)}
              placeholder="My Store"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-currency">Currency</Label>
            <Input
              id="bp-currency"
              value={bpCurrency}
              onChange={(e) => setBpCurrency(e.target.value)}
              placeholder="BDT"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bp-description">Description</Label>
            <textarea
              id="bp-description"
              value={bpDescription}
              onChange={(e) => setBpDescription(e.target.value)}
              placeholder="A brief description of your business..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Support Email
            </Label>
            <Input
              id="bp-email"
              type="email"
              value={bpEmail}
              onChange={(e) => setBpEmail(e.target.value)}
              placeholder="support@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Support Phone
            </Label>
            <Input
              id="bp-phone"
              value={bpPhone}
              onChange={(e) => setBpPhone(e.target.value)}
              placeholder="+880..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-shipping" className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Default Shipping Cost
            </Label>
            <Input
              id="bp-shipping"
              type="number"
              value={bpShippingCost}
              onChange={(e) => setBpShippingCost(e.target.value)}
              placeholder="60"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSaveProfile}
            disabled={saving === "profile"}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saving === "profile" ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </SettingsSection>

      {/* ─── Shipping Rates ────────────────────────────────────── */}
      <SettingsSection
        icon={Truck}
        title="Shipping Rates"
        description={`${shippingRates.length} district rates configured. The AI uses these to calculate shipping.`}
      >
        {shippingRates.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>District</span>
              <span>Cost</span>
              <span>Est. Days</span>
              <span>Status</span>
            </div>
            {shippingRates.map((rate) => (
              <div
                key={rate.id}
                className="grid grid-cols-4 items-center gap-4 rounded-xl bg-muted/30 px-3 py-2.5 text-sm"
              >
                <span className="font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {rate.district}
                </span>
                <span className="tabular-nums">৳{rate.cost}</span>
                <span className="text-muted-foreground">
                  {rate.estimatedDays ? `${rate.estimatedDays} days` : "—"}
                </span>
                <Badge variant={rate.active ? "success" : "secondary"} className="w-fit text-[10px]">
                  {rate.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No shipping rates configured yet.
          </p>
        )}
      </SettingsSection>

      {/* ─── FAQs ──────────────────────────────────────────────── */}
      <SettingsSection
        icon={HelpCircle}
        title="FAQs"
        description={`${faqs.length} frequently asked questions. The AI agent uses these to answer customer queries.`}
      >
        {faqs.length > 0 ? (
          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f.id} className="rounded-xl bg-muted/30 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Q: {f.question}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A: {f.answer}
                </p>
                {f.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No FAQs configured yet.
          </p>
        )}
      </SettingsSection>

      {/* ─── Policies ──────────────────────────────────────────── */}
      <SettingsSection
        icon={FileText}
        title="Policies"
        description={`${policies.length} store policies. These give the AI context about your return, shipping, and warranty rules.`}
      >
        {policies.length > 0 ? (
          <div className="space-y-3">
            {policies.map((p) => (
              <div key={p.id} className="rounded-xl bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <Badge variant={p.active ? "default" : "secondary"} className="text-[10px] capitalize">
                    {p.type}
                  </Badge>
                  <h4 className="text-sm font-semibold text-foreground">
                    {p.title}
                  </h4>
                  {!p.active && (
                    <Badge variant="destructive" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No policies configured yet.
          </p>
        )}
      </SettingsSection>
    </div>
  );
}
