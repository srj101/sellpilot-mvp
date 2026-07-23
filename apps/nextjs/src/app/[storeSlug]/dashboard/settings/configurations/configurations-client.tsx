"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Save, Globe, ShoppingBag, Eye, EyeOff, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { useTRPC } from "~/trpc/react";

type BusinessProfile = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  currency: string;
  defaultShippingCost: number;
  supportEmail: string | null;
  supportPhone: string | null;
  metadata: Record<string, any> | null;
};

export function ConfigurationsClient({ initialProfile }: { initialProfile: BusinessProfile | null }) {
  const trpc = useTRPC();
  const upsertMutation = useMutation(trpc.agent.upsertBusinessProfile.mutationOptions());

  // Existing profile values
  const profile = initialProfile || {
    name: "My Business",
    description: "",
    logoUrl: "",
    currency: "BDT",
    defaultShippingCost: 0,
    supportEmail: "",
    supportPhone: "",
    metadata: {},
  };

  const metadata: Record<string, any> = profile.metadata || {};

  // Form states
  const [wordpressSiteUrl, setWordpressSiteUrl] = useState((metadata.wordpressSiteUrl as string) ?? "");
  const [wordpressConsumerKey, setWordpressConsumerKey] = useState((metadata.wordpressConsumerKey as string) ?? "");
  const [wordpressConsumerSecret, setWordpressConsumerSecret] = useState((metadata.wordpressConsumerSecret as string) ?? "");

  const [shopifyShopDomain, setShopifyShopDomain] = useState((metadata.shopifyShopDomain as string) ?? "");
  const [shopifyAccessToken, setShopifyAccessToken] = useState((metadata.shopifyAccessToken as string) ?? "");

  const [showSecret, setShowSecret] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setIsSaved(false);
    try {
      await upsertMutation.mutateAsync({
        name: profile.name,
        description: profile.description ?? "",
        logoUrl: profile.logoUrl ?? "",
        currency: profile.currency || "BDT",
        defaultShippingCost: profile.defaultShippingCost || 0,
        supportEmail: profile.supportEmail ?? "",
        supportPhone: profile.supportPhone ?? "",
        metadata: {
          ...metadata,
          wordpressSiteUrl,
          wordpressConsumerKey,
          wordpressConsumerSecret,
          shopifyShopDomain,
          shopifyAccessToken,
        },
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      alert("Failed to save configurations");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* WordPress WooCommerce Credentials Card */}
      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center gap-3">
          <Globe className="h-6 w-6 text-primary shrink-0" />
          <div>
            <CardTitle>WooCommerce Integration</CardTitle>
            <CardDescription>Synchronize catalog and inventory with WooCommerce storefront REST APIs</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wp-site">WordPress Site URL</Label>
            <Input
              id="wp-site"
              value={wordpressSiteUrl}
              onChange={(e) => setWordpressSiteUrl(e.target.value)}
              placeholder="e.g. https://my-woocommerce-store.com"
              className="rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="wp-key">WooCommerce Consumer Key</Label>
              <Input
                id="wp-key"
                value={wordpressConsumerKey}
                onChange={(e) => setWordpressConsumerKey(e.target.value)}
                placeholder="ck_..."
                className="rounded-lg font-mono"
              />
            </div>

            <div className="space-y-1.5 relative">
              <Label htmlFor="wp-secret">WooCommerce Consumer Secret</Label>
              <div className="relative">
                <Input
                  id="wp-secret"
                  type={showSecret ? "text" : "password"}
                  value={wordpressConsumerSecret}
                  onChange={(e) => setWordpressConsumerSecret(e.target.value)}
                  placeholder="cs_..."
                  className="rounded-lg font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shopify Integration Credentials Card */}
      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-primary shrink-0" />
          <div>
            <CardTitle>Shopify Integration</CardTitle>
            <CardDescription>Connect to your Shopify Admin GraphQL API endpoint</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="shopify-domain">Shopify Shop Domain</Label>
            <Input
              id="shopify-domain"
              value={shopifyShopDomain}
              onChange={(e) => setShopifyShopDomain(e.target.value)}
              placeholder="e.g. my-shop.myshopify.com"
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shopify-token">Admin Access Token</Label>
            <Input
              id="shopify-token"
              type={showSecret ? "text" : "password"}
              value={shopifyAccessToken}
              onChange={(e) => setShopifyAccessToken(e.target.value)}
              placeholder="shpat_..."
              className="rounded-lg font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Footer */}
      <div className="flex items-center justify-between">
        {isSaved && (
          <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" /> Credentials saved successfully
          </span>
        )}
        <div className="flex-1" />
        <Button type="submit" disabled={isSaving} className="gap-2 rounded-lg px-6 shrink-0">
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </form>
  );
}
