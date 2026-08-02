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
  Mail,
  Phone,
  DollarSign,
  MapPin,
  Store,
  UploadCloud,
  Loader2,
  Bot,
  Clock,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Badge } from "@acme/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

type StoreProfile = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  description: string | null;
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
  agentName: string | null;
  conversationTone: string;
  preferredLanguage: string;
  abandonedFollowupMinutes: number;
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

const inputCls = "rounded-lg";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Store;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-hover">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="mt-0.5 text-sm">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

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
  const [uploading, setUploading] = useState(false);

  const upsertProfile = useMutation(trpc.agent.upsertBusinessProfile.mutationOptions());
  const updateStore = useMutation(trpc.business.update.mutationOptions());
  const getUploadUrl = useMutation(trpc.business.getUploadUrl.mutationOptions());

  // Business Profile state (name/description sync to both business & business_profile)
  const [storeName, setStoreName] = useState(storeProfile.name);
  const [storeDescription, setStoreDescription] = useState(storeProfile.description ?? "");
  const [storeLogo, setStoreLogo] = useState<string | null>(storeProfile.logo);
  const [bpCurrency, setBpCurrency] = useState(profile?.currency ?? "BDT");
  const [bpShippingCost, setBpShippingCost] = useState(String(profile?.defaultShippingCost ?? 0));
  const [bpEmail, setBpEmail] = useState(profile?.supportEmail ?? "");
  const [bpPhone, setBpPhone] = useState(profile?.supportPhone ?? "");

  // AI Agent settings state
  const [agentName, setAgentName] = useState(profile?.agentName ?? "");
  const [conversationTone, setConversationTone] = useState(profile?.conversationTone ?? "friendly");
  const [preferredLanguage, setPreferredLanguage] = useState(profile?.preferredLanguage ?? "auto");
  const [followUpMinutes, setFollowUpMinutes] = useState(String(profile?.abandonedFollowupMinutes ?? 30));

  // Check if profile inputs differ from database values to enable Save button
  const isBusinessDirty =
    storeName.trim() !== storeProfile.name ||
    storeDescription.trim() !== (storeProfile.description ?? "") ||
    storeLogo !== storeProfile.logo ||
    bpCurrency !== (profile?.currency ?? "BDT") ||
    bpShippingCost !== String(profile?.defaultShippingCost ?? 0) ||
    bpEmail !== (profile?.supportEmail ?? "") ||
    bpPhone !== (profile?.supportPhone ?? "");

  const handleSaveBusiness = async () => {
    if (!storeName.trim()) {
      toast.error("Business name cannot be empty");
      return;
    }
    setSaving("business");
    try {
      await updateStore.mutateAsync({
        name: storeName.trim(),
        description: storeDescription.trim() || undefined,
        logo: storeLogo,
      });
      await upsertProfile.mutateAsync({
        name: storeName.trim(),
        description: storeDescription.trim() || undefined,
        logoUrl: storeLogo ?? undefined,
        currency: bpCurrency,
        defaultShippingCost: Number(bpShippingCost),
        supportEmail: bpEmail,
        supportPhone: bpPhone,
      });
      toast.success("Business profile updated successfully!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update business profile");
    } finally {
      setSaving(null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setUploading(true);
    try {
      const res = await getUploadUrl.mutateAsync({ contentType: file.type });

      const uploadRes = await fetch(res.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to write image data to storage");
      }

      setStoreLogo(res.publicUrl);
      toast.success("Logo uploaded successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error uploading image to S3");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAiAgent = async () => {
    const minutes = Number(followUpMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Follow-up delay must be at least 1 minute");
      return;
    }
    setSaving("ai-agent");
    try {
      await upsertProfile.mutateAsync({
        name: storeName.trim(),
        description: storeDescription.trim() || undefined,
        logoUrl: storeLogo ?? undefined,
        currency: bpCurrency,
        defaultShippingCost: Number(bpShippingCost),
        supportEmail: bpEmail,
        supportPhone: bpPhone,
        agentName: agentName.trim() || undefined,
        conversationTone: conversationTone as "friendly" | "professional" | "playful" | "formal",
        preferredLanguage: preferredLanguage as "auto" | "bangla" | "english",
        abandonedFollowupMinutes: minutes,
      });
      toast.success("AI Agent settings saved!");
      router.refresh();
    } catch {
      toast.error("Failed to save AI Agent settings");
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your business profile and AI agent context.
          </p>
        </div>
      </div>

      {/* ─── Business Profile ──────────────────────────────────── */}
      <SectionCard
        icon={Building2}
        title="Business Profile"
        description="Your business name, logo, contact info, and defaults used by the AI agent."
      >
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Logo Upload */}
          <div className="flex flex-col items-center gap-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Logo</Label>
            <div className="relative group h-28 w-28 shrink-0 overflow-hidden rounded-2xl border bg-muted flex items-center justify-center shadow-inner">
              {storeLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={storeLogo} alt="Business logo" className="h-full w-full object-cover" />
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
              <span className="text-[10px] text-primary animate-pulse font-semibold">Uploading...</span>
            )}
          </div>

          {/* Fields */}
          <div className="flex-1 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="store-name">Business Name</Label>
                <Input
                  id="store-name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="My Business"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-slug">Business Handle (Slug)</Label>
                <Input
                  id="store-slug"
                  value={storeProfile.slug}
                  disabled
                  className="cursor-not-allowed rounded-lg bg-muted text-muted-foreground"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="store-description">Description</Label>
                <textarea
                  id="store-description"
                  value={storeDescription}
                  onChange={(e) => setStoreDescription(e.target.value)}
                  placeholder="Describe your business..."
                  className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  className={inputCls}
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
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-currency">Currency</Label>
                <Input
                  id="bp-currency"
                  value={bpCurrency}
                  onChange={(e) => setBpCurrency(e.target.value)}
                  placeholder="BDT"
                  className={inputCls}
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
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button
                onClick={handleSaveBusiness}
                disabled={!isBusinessDirty || saving === "business"}
                className="gap-2 rounded-lg"
              >
                <Save className="h-4 w-4" />
                {saving === "business" ? "Saving..." : "Save Business Profile"}
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ─── AI Agent ───────────────────────────────────────────── */}
      <SectionCard
        icon={Bot}
        title="AI Agent"
        description="How the AI sales agent introduces itself, talks, and follows up on abandoned conversations."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Agent Name</Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder={storeName || "Defaults to your business name"}
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-tone">Conversation Tone</Label>
            <select
              id="agent-tone"
              value={conversationTone}
              onChange={(e) => setConversationTone(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="playful">Playful</option>
              <option value="formal">Formal</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-language">Preferred Reply Language</Label>
            <select
              id="agent-language"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="auto">Auto-detect (matches customer)</option>
              <option value="bangla">Always Bangla</option>
              <option value="english">Always English</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-followup" className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Abandoned Follow-up Delay (minutes)
            </Label>
            <Input
              id="agent-followup"
              type="number"
              min={1}
              value={followUpMinutes}
              onChange={(e) => setFollowUpMinutes(e.target.value)}
              placeholder="30"
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end border-t pt-4">
          <Button
            onClick={handleSaveAiAgent}
            disabled={saving === "ai-agent"}
            className="gap-2 rounded-lg"
          >
            <Save className="h-4 w-4" />
            {saving === "ai-agent" ? "Saving..." : "Save AI Agent Settings"}
          </Button>
        </div>
      </SectionCard>

      {/* ─── Shipping Rates ─────────────────────────────────────── */}
      <SectionCard
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
                className="grid grid-cols-4 items-center gap-4 rounded-lg bg-muted/30 px-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-1.5 font-medium">
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
      </SectionCard>

      {/* ─── FAQs ───────────────────────────────────────────────── */}
      <SectionCard
        icon={HelpCircle}
        title="FAQs"
        description={`${faqs.length} frequently asked questions. The AI agent uses these to answer customer queries.`}
      >
        {faqs.length > 0 ? (
          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f.id} className="rounded-lg bg-muted/30 p-4">
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
      </SectionCard>

      {/* ─── Policies ───────────────────────────────────────────── */}
      <SectionCard
        icon={FileText}
        title="Policies"
        description={`${policies.length} store policies. These give the AI context about your return, shipping, and warranty rules.`}
      >
        {policies.length > 0 ? (
          <div className="space-y-3">
            {policies.map((p) => (
              <div key={p.id} className="rounded-lg bg-muted/30 p-4">
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
      </SectionCard>
    </div>
  );
}
