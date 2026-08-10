"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { toast } from "@acme/ui/toast";

import { ConfirmDialog } from "~/app/[businessSlug]/dashboard/_components/confirm-dialog";
import { useTRPC } from "~/trpc/react";

import { AiAgentSection } from "./_components/ai-agent-section";
import { BusinessProfileSection } from "./_components/business-profile-section";
import {
  CreateFaqDialog,
  CreatePolicyDialog,
  CreateShippingRateDialog,
} from "./_components/create-dialogs";
import { FaqsSection } from "./_components/faqs-section";
import { NotificationsSection } from "./_components/notifications-section";
import { PersonalProfileSection } from "./_components/personal-profile-section";
import { PoliciesSection } from "./_components/policies-section";
import { SettingsNav } from "./_components/settings-nav";
import { ShippingSection } from "./_components/shipping-section";
import type { FAQ, NotifPrefs, Policy, SectionId, SettingsClientProps, ShippingRate } from "./_components/types";

export function SettingsClient({
  storeProfile,
  profile,
  shippingRates,
  faqs,
  policies,
  user,
}: SettingsClientProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("business");

  // Owner-only gating for create/delete actions (same source as the sidebar).
  const { data: myPermissions } = useQuery(trpc.roles.getMyPermissions.queryOptions());
  const isOwner = myPermissions?.role === "owner";

  const upsertProfile = useMutation(trpc.agent.upsertBusinessProfile.mutationOptions());
  const updateStore = useMutation(trpc.business.update.mutationOptions());
  const getUploadUrl = useMutation(trpc.business.getUploadUrl.mutationOptions());

  const deleteShippingRate = useMutation(trpc.settings.deleteShippingRate.mutationOptions());
  const deleteFaq = useMutation(trpc.settings.deleteFaq.mutationOptions());
  const deletePolicy = useMutation(trpc.settings.deletePolicy.mutationOptions());

  // Create/delete dialog state
  const [createDialog, setCreateDialog] = useState<"shipping" | "faq" | "policy" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "shipping"; row: ShippingRate }
    | { kind: "faq"; row: FAQ }
    | { kind: "policy"; row: Policy }
    | null
  >(null);

  // Business Profile state (name/description sync to both business & business_profile)
  const [storeName, setStoreName] = useState(storeProfile.name);
  const [storeDescription, setStoreDescription] = useState(storeProfile.description ?? "");
  const [storeLogo, setStoreLogo] = useState<string | null>(storeProfile.logo);
  const [bpCurrency, setBpCurrency] = useState(profile?.currency ?? "BDT");
  const [bpShippingCost, setBpShippingCost] = useState(String(profile?.defaultShippingCost ?? 0));
  const [bpEmail, setBpEmail] = useState(profile?.supportEmail ?? "");
  const [bpNotificationEmail, setBpNotificationEmail] = useState(profile?.notificationEmail ?? "");
  const [bpPhone, setBpPhone] = useState(profile?.supportPhone ?? "");

  // AI Agent settings state
  const [agentName, setAgentName] = useState(profile?.agentName ?? "");
  const [conversationTone, setConversationTone] = useState(profile?.conversationTone ?? "friendly");
  const [preferredLanguage, setPreferredLanguage] = useState(profile?.preferredLanguage ?? "auto");
  const [followUpMinutes, setFollowUpMinutes] = useState(String(profile?.abandonedFollowupMinutes ?? 30));
  const [autoEscalateOnLowConfidence, setAutoEscalateOnLowConfidence] = useState(profile?.autoEscalateOnLowConfidence ?? false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(String(profile?.confidenceThreshold ?? 30));

  // Notification Preferences State (FR-SET-04)
  const { data: serverNotifPrefs } = useQuery(trpc.agent.getNotificationPreferences.queryOptions());
  const updateNotifPrefs = useMutation(trpc.agent.updateNotificationPreferences.mutationOptions());
  const [localNotifPrefs, setLocalNotifPrefs] = useState<NotifPrefs | null>(null);

  const notifPrefs = useMemo(() => {
    if (localNotifPrefs) return localNotifPrefs;
    if (!serverNotifPrefs) return {};
    const map: NotifPrefs = {};
    for (const item of serverNotifPrefs) {
      map[item.eventType] = { emailEnabled: item.emailEnabled, inAppEnabled: item.inAppEnabled };
    }
    return map;
  }, [localNotifPrefs, serverNotifPrefs]);

  const handleNotifToggle = (eventType: string, channel: "emailEnabled" | "inAppEnabled", value: boolean) => {
    setLocalNotifPrefs((prev) => {
      const currentMap = prev ?? notifPrefs;
      const existing = currentMap[eventType] ?? { emailEnabled: true, inAppEnabled: true };
      return {
        ...currentMap,
        [eventType]: {
          ...existing,
          [channel]: value,
        },
      };
    });
  };

  const handleSaveNotifPrefs = async () => {
    setSaving("notif_prefs");
    try {
      const payload = Object.entries(notifPrefs).map(([eventType, prefs]) => ({
        eventType: eventType as "new_order" | "low_stock" | "human_handoff" | "quota_alert" | "weekly_insights",
        emailEnabled: prefs.emailEnabled,
        inAppEnabled: prefs.inAppEnabled,
      }));
      await updateNotifPrefs.mutateAsync(payload);
      toast.success("Notification preferences saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notification preferences");
    } finally {
      setSaving(null);
    }
  };

  // Check if profile inputs differ from database values to enable Save button
  const isBusinessDirty =
    storeName.trim() !== storeProfile.name ||
    storeDescription.trim() !== (storeProfile.description ?? "") ||
    storeLogo !== storeProfile.logo ||
    bpCurrency !== (profile?.currency ?? "BDT") ||
    bpShippingCost !== String(profile?.defaultShippingCost ?? 0) ||
    bpEmail !== (profile?.supportEmail ?? "") ||
    bpNotificationEmail !== (profile?.notificationEmail ?? "") ||
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
        notificationEmail: bpNotificationEmail,
        supportPhone: bpPhone,
      });
      toast.success("Business profile updated successfully!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update business profile");
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
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error uploading image to S3");
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
        autoEscalateOnLowConfidence,
        confidenceThreshold: Number(confidenceThreshold) || 30,
      });
      toast.success("AI Agent settings saved!");
      router.refresh();
    } catch {
      toast.error("Failed to save AI Agent settings");
    }
    setSaving(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "shipping") {
        await deleteShippingRate.mutateAsync({ id: deleteTarget.row.id });
        toast.success(`Deleted shipping rate for ${deleteTarget.row.district}`);
      } else if (deleteTarget.kind === "faq") {
        await deleteFaq.mutateAsync({ id: deleteTarget.row.id });
        toast.success("FAQ deleted");
      } else {
        await deletePolicy.mutateAsync({ id: deleteTarget.row.id });
        toast.success(`Deleted "${deleteTarget.row.title}"`);
      }
      router.refresh();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your business profile, AI agent context, and store policies.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />

        {/* ─── Content ────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-6">
          {activeSection === "business" && (
            <BusinessProfileSection
              storeName={storeName}
              setStoreName={setStoreName}
              storeDescription={storeDescription}
              setStoreDescription={setStoreDescription}
              storeLogo={storeLogo}
              storeSlug={storeProfile.slug}
              bpCurrency={bpCurrency}
              setBpCurrency={setBpCurrency}
              bpShippingCost={bpShippingCost}
              setBpShippingCost={setBpShippingCost}
              bpEmail={bpEmail}
              setBpEmail={setBpEmail}
              bpNotificationEmail={bpNotificationEmail}
              setBpNotificationEmail={setBpNotificationEmail}
              bpPhone={bpPhone}
              setBpPhone={setBpPhone}
              isBusinessDirty={isBusinessDirty}
              saving={saving === "business"}
              uploading={uploading}
              onSave={handleSaveBusiness}
              onLogoUpload={handleLogoUpload}
            />
          )}

          {activeSection === "profile" && <PersonalProfileSection user={user} />}

          {activeSection === "notifications" && (
            <NotificationsSection
              notifPrefs={notifPrefs}
              onToggle={handleNotifToggle}
              saving={saving === "notif_prefs"}
              onSave={handleSaveNotifPrefs}
            />
          )}

          {activeSection === "ai-agent" && (
            <AiAgentSection
              storeName={storeName}
              agentName={agentName}
              setAgentName={setAgentName}
              conversationTone={conversationTone}
              setConversationTone={setConversationTone}
              preferredLanguage={preferredLanguage}
              setPreferredLanguage={setPreferredLanguage}
              followUpMinutes={followUpMinutes}
              setFollowUpMinutes={setFollowUpMinutes}
              autoEscalateOnLowConfidence={autoEscalateOnLowConfidence}
              setAutoEscalateOnLowConfidence={setAutoEscalateOnLowConfidence}
              confidenceThreshold={confidenceThreshold}
              setConfidenceThreshold={setConfidenceThreshold}
              saving={saving === "ai-agent"}
              onSave={handleSaveAiAgent}
            />
          )}

          {activeSection === "shipping" && (
            <ShippingSection
              shippingRates={shippingRates}
              isOwner={isOwner}
              deleting={deleteShippingRate.isPending}
              onCreate={() => setCreateDialog("shipping")}
              onDelete={(rate) => setDeleteTarget({ kind: "shipping", row: rate })}
            />
          )}

          {activeSection === "faqs" && (
            <FaqsSection
              faqs={faqs}
              isOwner={isOwner}
              deleting={deleteFaq.isPending}
              onCreate={() => setCreateDialog("faq")}
              onDelete={(f) => setDeleteTarget({ kind: "faq", row: f })}
            />
          )}

          {activeSection === "policies" && (
            <PoliciesSection
              policies={policies}
              isOwner={isOwner}
              deleting={deletePolicy.isPending}
              onCreate={() => setCreateDialog("policy")}
              onDelete={(p) => setDeleteTarget({ kind: "policy", row: p })}
            />
          )}
        </div>
      </div>

      {/* ─── Create dialogs (owner only) ─────────────────────────────── */}
      {isOwner && createDialog === "shipping" && (
        <CreateShippingRateDialog
          onClose={() => setCreateDialog(null)}
          onCreated={() => {
            setCreateDialog(null);
            router.refresh();
          }}
        />
      )}
      {isOwner && createDialog === "faq" && (
        <CreateFaqDialog
          onClose={() => setCreateDialog(null)}
          onCreated={() => {
            setCreateDialog(null);
            router.refresh();
          }}
        />
      )}
      {isOwner && createDialog === "policy" && (
        <CreatePolicyDialog
          onClose={() => setCreateDialog(null)}
          onCreated={() => {
            setCreateDialog(null);
            router.refresh();
          }}
        />
      )}

      {/* ─── Delete confirmations ─────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.kind === "shipping" ? "Delete shipping rate?" : deleteTarget?.kind === "faq" ? "Delete FAQ?" : "Delete policy?"}
        description={
          deleteTarget?.kind === "shipping"
            ? `This permanently deletes the shipping rate for ${deleteTarget.row.district}.`
            : deleteTarget?.kind === "faq"
              ? "This permanently deletes this FAQ. The AI agent will no longer use it."
              : `This permanently deletes "${deleteTarget?.row.title}".`
        }
        confirmLabel="Delete"
        destructive
        loading={deleteShippingRate.isPending || deleteFaq.isPending || deletePolicy.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
