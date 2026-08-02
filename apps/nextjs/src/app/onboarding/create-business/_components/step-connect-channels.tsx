"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { AlertTriangle, MessageCircle, Facebook, Instagram, Upload, Link2, Loader2, Lock, ImagePlus } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acme/ui/tabs";
import { Skeleton } from "@acme/ui/skeleton";
import { ConnectedPagesList } from "../../../[businessSlug]/dashboard/integrations/_components/connected-pages-list";
import { WhatsAppConnectButton } from "../../../[businessSlug]/dashboard/integrations/_components/whatsapp-connect-button";
import {
  ErrorState,
  FacebookPagePicker,
  InstagramAccountPicker,
} from "../../../[businessSlug]/dashboard/integrations/_components/meta-account-picker";
import { cancelMetaSelection, fetchAvailableMetaPages } from "../../../[businessSlug]/dashboard/integrations/actions";
import { OnboardingShell } from "./onboarding-shell";

/** Shown instead of a Connect control when the channel isn't in the business's current plan. */
function UpgradeBadge() {
  return (
    <a
      href="/pricing"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
    >
      <Lock className="h-3.5 w-3.5" />
      Upgrade
    </a>
  );
}

/** Shows a spinner while `cancelMetaSelection`'s server action is in flight. */
function DoneButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Done
    </Button>
  );
}

export function StepConnectChannels({ businessSlug, onNext }: { businessSlug: string; onNext: () => void }) {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const connectError = searchParams.get("error");
  const { data: connections = [], refetch: refetchConnections } = useQuery(trpc.integrations.list.queryOptions());
  const { data: currentBusiness } = useQuery(trpc.business.current.queryOptions());
  const { data: channelAccess, isPending: channelAccessPending } = useQuery(trpc.integrations.getChannelAccess.queryOptions());
  const allowedChannels = new Set(channelAccess?.channels ?? []);
  const lockedMessenger = !!channelAccess && !allowedChannels.has("messenger");
  const lockedInstagram = !!channelAccess && !allowedChannels.has("instagram");
  const lockedWhatsapp = !!channelAccess && !allowedChannels.has("whatsapp");
  const getUploadUrl = useMutation(trpc.business.getUploadUrl.mutationOptions());
  const updateLogo = useMutation(trpc.business.updateLogo.mutationOptions());
  const [logo, setLogo] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (currentBusiness?.logo) setLogo(currentBusiness.logo);
  }, [currentBusiness]);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    setLogoError(null);
    setLogoUploading(true);
    try {
      const { uploadUrl, publicUrl } = await getUploadUrl.mutateAsync({ contentType: file.type });
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error("Failed to upload image");
      await updateLogo.mutateAsync({ logo: publicUrl });
      setLogo(publicUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  }

  const [metaPages, setMetaPages] = useState<Awaited<ReturnType<typeof fetchAvailableMetaPages>> | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const fetchPages = async () => {
      try {
        const data = await fetchAvailableMetaPages();
        setMetaPages(data);
        if (data.isPicking) {
          if (!interval) interval = setInterval(fetchPages, 5000);
        } else {
          if (interval) clearInterval(interval);
        }
      } catch (err) {
        console.error("Failed to fetch meta pages", err);
      }
    };
    
    fetchPages();
    return () => clearInterval(interval);
  }, []);

  const isPicking = metaPages?.isPicking;
  const pickerIntent = metaPages?.intent;
  const availablePages = metaPages?.pages || [];
  const pickerError = metaPages?.error;

  const hasConnections = connections.length > 0;
  const showRightPanel = hasConnections || isPicking;

  // Active tab state
  const [activeTab, setActiveTab] = useState<string>(pickerIntent || "facebook");

  // Keep tab in sync if intent changes from backend
  useEffect(() => {
    if (pickerIntent && activeTab !== pickerIntent) {
      setActiveTab(pickerIntent);
    }
  }, [pickerIntent]);

  const fbPages = connections
    .filter((c) => c.platform === "facebook_page")
    .map((c) => ({
      id: c.id,
      name: c.platformAccountName ?? "Facebook Page",
      externalId: c.platformAccountId,
      webhookStatus: c.webhookSubscriptionStatus,
      connectedAt: c.connectedAt,
    }));
  const fbConnectedIds = new Set(fbPages.map((p) => p.externalId).filter((id): id is string => !!id));
  const fbAvailable = availablePages.filter(
    (p) => !fbConnectedIds.has(p.id) && p.id !== "no_page",
  );

  const igPages = connections
    .filter((c) => c.platform === "instagram")
    .map((c) => ({
      id: c.id,
      name: c.platformAccountName ?? "Instagram",
      externalId: c.platformAccountId,
      webhookStatus: c.webhookSubscriptionStatus,
      connectedAt: c.connectedAt,
    }));
  const igConnectedIds = new Set(igPages.map((p) => p.externalId).filter((id): id is string => !!id));
  const igAvailable = availablePages.filter(
    (p) => !igConnectedIds.has(p.instagram_business_account?.id ?? ""),
  );

  const waPages = connections
    .filter((c) => c.platform === "whatsapp")
    .map((c) => ({
      id: c.id,
      name: c.platformAccountName ?? "WhatsApp",
      externalId: c.platformAccountId,
      webhookStatus: c.webhookSubscriptionStatus,
      connectedAt: c.connectedAt,
    }));
  const waConnectedIds = new Set(waPages.map((p) => p.externalId).filter((id): id is string => !!id));
  const waAvailable = availablePages.filter(
    (p) => !waConnectedIds.has(p.id),
  );

  const returnTo = `/onboarding/create-business?step=connect&slug=${businessSlug}`;

  const connectUrl = (channel: string) =>
    `/api/integrations/facebook/connect?businessId=${businessSlug}&channel=${channel}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <OnboardingShell
      current="connect"
      title="Connect your channels"
      description="Link WhatsApp, Messenger, and Instagram so the AI agent can start selling right away."
      maxWidthClassName={showRightPanel ? "max-w-5xl" : "max-w-2xl"}
    >
      {connectError && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {connectError}
        </div>
      )}

      <div className={`grid gap-8 ${showRightPanel ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* Left Column: Connect Actions */}
          <div className="space-y-4">
            <label
              className={cn(
                "group relative flex items-center gap-4 rounded-xl border border-dashed p-5 text-left transition-colors",
                logoUploading ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary/40 hover:bg-primary/5",
              )}
            >
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {logo ? (
                  <img src={logo} alt="Business logo" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity",
                    logoUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {logoUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <Upload className="h-4 w-4 text-white" />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 font-semibold">
                  Business logo
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Optional</span>
                </h3>
                <p className={logoError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                  {logoUploading
                    ? "Uploading..."
                    : logoError
                      ? logoError
                      : "Click to upload — PNG or JPG, shown to customers in chats and checkout."}
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleLogoChange}
                disabled={logoUploading}
              />
            </label>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-5 bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-4">
                  {channelAccessPending ? (
                    <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                  ) : (
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full",
                        lockedWhatsapp ? "bg-muted text-muted-foreground" : "bg-green-500/10 text-green-500",
                      )}
                    >
                      {lockedWhatsapp ? <Lock className="h-5 w-5" /> : <MessageCircle className="h-6 w-6" />}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold">WhatsApp Business</h3>
                    <p className="text-sm text-muted-foreground">
                      {channelAccessPending ? "Checking your plan…" : lockedWhatsapp ? "Not included in your current plan" : "Automate replies on WhatsApp"}
                    </p>
                  </div>
                </div>
                {channelAccessPending ? (
                  <Skeleton className="h-8 w-[100px] rounded-md" />
                ) : lockedWhatsapp ? (
                  <UpgradeBadge />
                ) : (
                  <div className="w-[100px]">
                    <WhatsAppConnectButton />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border p-5 bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-4">
                  {channelAccessPending ? (
                    <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                  ) : (
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full",
                        lockedMessenger ? "bg-muted text-muted-foreground" : "bg-blue-500/10 text-blue-500",
                      )}
                    >
                      {lockedMessenger ? <Lock className="h-5 w-5" /> : <Facebook className="h-6 w-6" />}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold">Facebook Messenger</h3>
                    <p className="text-sm text-muted-foreground">
                      {channelAccessPending ? "Checking your plan…" : lockedMessenger ? "Not included in your current plan" : "Reply to comments and DMs"}
                    </p>
                  </div>
                </div>
                {channelAccessPending ? (
                  <Skeleton className="h-8 w-[100px] rounded-md" />
                ) : lockedMessenger ? (
                  <UpgradeBadge />
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = connectUrl("facebook");
                    }}
                  >
                    <Link2 className="h-4 w-4" />
                    Connect
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border p-5 bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-4">
                  {channelAccessPending ? (
                    <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                  ) : (
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full",
                        lockedInstagram ? "bg-muted text-muted-foreground" : "bg-pink-500/10 text-pink-500",
                      )}
                    >
                      {lockedInstagram ? <Lock className="h-5 w-5" /> : <Instagram className="h-6 w-6" />}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold">Instagram DM</h3>
                    <p className="text-sm text-muted-foreground">
                      {channelAccessPending ? "Checking your plan…" : lockedInstagram ? "Not included in your current plan" : "Handle Instagram stories and messages"}
                    </p>
                  </div>
                </div>
                {channelAccessPending ? (
                  <Skeleton className="h-8 w-[100px] rounded-md" />
                ) : lockedInstagram ? (
                  <UpgradeBadge />
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = connectUrl("instagram");
                    }}
                  >
                    <Link2 className="h-4 w-4" />
                    Connect
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: single-channel picker while actively connecting one channel,
              otherwise a tabbed review of everything already connected. Showing all 3 tabs
              mid-pick (e.g. right after clicking "Connect" on Facebook) added confusing,
              irrelevant tab-switching to what should be a single focused step. */}
          {showRightPanel && (
            <div className="rounded-2xl border bg-card p-6 shadow-sm flex flex-col h-full max-h-full">
              {isPicking && pickerIntent === "facebook" ? (
                <div className="flex-1 overflow-y-auto outline-none scrollbar-thin">
                  <div className="mb-6">
                    <p className="text-muted-foreground mb-2 text-sm font-medium">Connected Facebook Pages</p>
                    <ConnectedPagesList pages={fbPages} emptyLabel="No Page connected yet." />
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-sm font-medium">Available Pages — click to connect</p>
                      <form action={cancelMetaSelection}>
                        <input type="hidden" name="channel" value="facebook" />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <DoneButton />
                      </form>
                    </div>
                    {pickerError ? (
                      <ErrorState errorMsg={pickerError} />
                    ) : (
                      <FacebookPagePicker pages={fbAvailable} connectedIds={fbConnectedIds} returnTo={returnTo} />
                    )}
                  </div>
                </div>
              ) : isPicking && pickerIntent === "instagram" ? (
                <div className="flex-1 overflow-y-auto outline-none scrollbar-thin">
                  <div className="mb-6">
                    <p className="text-muted-foreground mb-2 text-sm font-medium">Connected Instagram Accounts</p>
                    <ConnectedPagesList pages={igPages} emptyLabel="No Account connected yet." />
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-sm font-medium">Available Accounts — click to connect</p>
                      <form action={cancelMetaSelection}>
                        <input type="hidden" name="channel" value="instagram" />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <DoneButton />
                      </form>
                    </div>
                    {pickerError ? (
                      <ErrorState errorMsg={pickerError} />
                    ) : (
                      <InstagramAccountPicker pages={igAvailable} connectedIds={igConnectedIds} returnTo={returnTo} />
                    )}
                  </div>
                </div>
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                  <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="facebook">Facebook</TabsTrigger>
                    <TabsTrigger value="instagram">Instagram</TabsTrigger>
                    <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                  </TabsList>

                  <TabsContent value="facebook" className="flex-1 overflow-y-auto outline-none scrollbar-thin">
                    <p className="text-muted-foreground mb-2 text-sm font-medium">Connected Facebook Pages</p>
                    <ConnectedPagesList pages={fbPages} emptyLabel="No Page connected yet." />
                  </TabsContent>

                  <TabsContent value="instagram" className="flex-1 overflow-y-auto outline-none scrollbar-thin">
                    <p className="text-muted-foreground mb-2 text-sm font-medium">Connected Instagram Accounts</p>
                    <ConnectedPagesList pages={igPages} emptyLabel="No Account connected yet." />
                  </TabsContent>

                  <TabsContent value="whatsapp" className="flex-1 overflow-y-auto outline-none scrollbar-thin">
                    <p className="text-muted-foreground mb-2 text-sm font-medium">Connected WhatsApp Accounts</p>
                    <ConnectedPagesList pages={waPages} emptyLabel="No Account connected yet." />
                  </TabsContent>
                </Tabs>
              )}
            </div>
          )}
      </div>

      <div className="mt-8 flex items-center justify-end border-t pt-6">
        <button
          onClick={onNext}
          className="rounded-full bg-primary px-8 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          {hasConnections ? "Continue to Products →" : "Skip for now →"}
        </button>
      </div>
    </OnboardingShell>
  );
}
