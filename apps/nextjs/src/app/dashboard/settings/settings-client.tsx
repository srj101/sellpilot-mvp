"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Badge } from "@acme/ui/badge";
import { cn } from "@acme/ui";

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

type ShippingRate = {
  id: string;
  district: string;
  cost: number;
  estimatedDays: number | null;
  active: boolean;
};

type FAQ = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
};

type Policy = {
  id: string;
  type: string;
  title: string;
  body: string;
  active: boolean;
};

interface SettingsClientProps {
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
  profile,
  shippingRates,
  faqs,
  policies,
}: SettingsClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleSaveProfile = async () => {
    setSaving("profile");
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bpName,
          description: bpDescription,
          currency: bpCurrency,
          defaultShippingCost: Number(bpShippingCost),
          supportEmail: bpEmail,
          supportPhone: bpPhone,
        }),
      });
      if (res.ok) {
        showToast("Business profile saved!");
        router.refresh();
      } else {
        showToast("Failed to save profile");
      }
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

      {/* ─── Business Profile ──────────────────────────────────── */}
      <SettingsSection
        icon={Building2}
        title="Business Profile"
        description="Your store name, contact info, and defaults used by the AI agent."
        defaultOpen={true}
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
