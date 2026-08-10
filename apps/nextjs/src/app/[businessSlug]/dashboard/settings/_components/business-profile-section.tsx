import { DollarSign, Loader2, Mail, Phone, Save, Store, UploadCloud } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { SectionCard } from "./section-card";

const inputCls = "rounded-lg";

export function BusinessProfileSection({
  storeName,
  setStoreName,
  storeDescription,
  setStoreDescription,
  storeLogo,
  storeSlug,
  bpCurrency,
  setBpCurrency,
  bpShippingCost,
  setBpShippingCost,
  bpEmail,
  setBpEmail,
  bpNotificationEmail,
  setBpNotificationEmail,
  bpPhone,
  setBpPhone,
  isBusinessDirty,
  saving,
  uploading,
  onSave,
  onLogoUpload,
}: {
  storeName: string;
  setStoreName: (v: string) => void;
  storeDescription: string;
  setStoreDescription: (v: string) => void;
  storeLogo: string | null;
  storeSlug: string;
  bpCurrency: string;
  setBpCurrency: (v: string) => void;
  bpShippingCost: string;
  setBpShippingCost: (v: string) => void;
  bpEmail: string;
  setBpEmail: (v: string) => void;
  bpNotificationEmail: string;
  setBpNotificationEmail: (v: string) => void;
  bpPhone: string;
  setBpPhone: (v: string) => void;
  isBusinessDirty: boolean;
  saving: boolean;
  uploading: boolean;
  onSave: () => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <SectionCard
      icon={Store}
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
                onChange={onLogoUpload}
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
                value={storeSlug}
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
              <Label htmlFor="bp-notif-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-(--primary)" /> Notification Recipient Email
              </Label>
              <Input
                id="bp-notif-email"
                type="email"
                value={bpNotificationEmail}
                onChange={(e) => setBpNotificationEmail(e.target.value)}
                placeholder="Defaults to store owner account email"
                className={inputCls}
              />
              <p className="text-[11px] text-muted-foreground">
                System alerts and weekly digests will be sent to this email address. Leave blank to default to the store owner's account email.
              </p>
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
            <Button onClick={onSave} disabled={!isBusinessDirty || saving} className="gap-2 rounded-lg">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Business Profile"}
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
