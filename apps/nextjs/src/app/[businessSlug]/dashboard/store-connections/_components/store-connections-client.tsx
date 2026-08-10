"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Unplug,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@acme/ui/dialog";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { ConfirmDialog } from "~/app/[businessSlug]/dashboard/_components/confirm-dialog";
import { useTRPC } from "~/trpc/react";

import { ShopifyIcon, WooCommerceIcon } from "./store-connection-icons";

type Provider = "shopify" | "woocommerce";

interface ConnectionRow {
  id: string;
  provider: Provider;
  storeUrl: string;
  storeName: string | null;
  status: string;
  connectedAt: Date;
  lastSyncAt: Date | null;
  credentialHint: { token?: string; consumerKey?: string };
}

const PROVIDER_META: Record<
  Provider,
  {
    name: string;
    tagline: string;
    description: string;
    icon: React.ElementType;
    accent: string;
    fields: { key: "storeUrl" | "accessToken" | "consumerKey" | "consumerSecret"; label: string; placeholder: string; type: string }[];
  }
> = {
  shopify: {
    name: "Shopify",
    tagline: "Import products from your Shopify store",
    description:
      "Create a custom app in your Shopify admin, grant Products read access, and paste the admin API access token. SellPilot will pull your catalog into Products.",
    icon: ShopifyIcon,
    accent: "from-[#95BF47] via-[#7B9B3C] to-[#4C6512]",
    fields: [
      {
        key: "storeUrl",
        label: "Store URL",
        placeholder: "https://your-store.myshopify.com",
        type: "text",
      },
      {
        key: "accessToken",
        label: "Admin API access token",
        placeholder: "shpat_...",
        type: "password",
      },
    ],
  },
  woocommerce: {
    name: "WooCommerce",
    tagline: "Import products from your WooCommerce store",
    description:
      "Create API credentials in WooCommerce → Settings → Advanced → REST API (read-only, Products only). Newer stores need the free 'WooCommerce Legacy REST API' plugin for the API-key flow.",
    icon: WooCommerceIcon,
    accent: "from-[#9b5c8f] via-[#7E54C3] to-[#4C2A6E]",
    fields: [
      {
        key: "storeUrl",
        label: "Store URL",
        placeholder: "https://your-store.com",
        type: "text",
      },
      {
        key: "consumerKey",
        label: "Consumer key",
        placeholder: "ck_...",
        type: "password",
      },
      {
        key: "consumerSecret",
        label: "Consumer secret",
        placeholder: "cs_...",
        type: "password",
      },
    ],
  },
};

interface CredentialsFormState {
  storeUrl: string;
  accessToken?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

function credentialsPayload(provider: Provider, form: CredentialsFormState) {
  return provider === "shopify"
    ? { accessToken: form.accessToken?.trim() ?? "" }
    : { consumerKey: form.consumerKey?.trim() ?? "", consumerSecret: form.consumerSecret?.trim() ?? "" };
}

export function StoreConnectionsClient({
  connections,
}: {
  connections: ConnectionRow[];
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [connectFor, setConnectFor] = useState<Provider | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectionRow | null>(null);

  const disconnectMutation = useMutation(trpc.storeConnections.disconnect.mutationOptions());

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: trpc.storeConnections.list.queryKey() });
  };

  const byProvider = (p: Provider) => connections.find((c) => c.provider === p);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Connect Store</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Connect your Shopify or WooCommerce store to import your product catalog. One store per
          platform, swap any time.
        </p>
      </div>

      <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        {(["shopify", "woocommerce"] as const).map((provider) => {
          const meta = PROVIDER_META[provider];
          const conn = byProvider(provider);
          const Icon = meta.icon;
          return (
            <div
              key={provider}
              className="group relative flex h-64 w-full flex-col justify-end overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
            >
              {/* Brand gradient background */}
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-br",
                  meta.accent,
                  conn?.status === "error" ? "grayscale" : "",
                )}
              />

              {/* Watermark icon */}
              <Icon className="absolute -top-4 -right-4 h-24 w-24 rotate-12 text-white/10" />

              {/* Centered brand icon */}
              <div className="absolute inset-0 flex items-center justify-center pb-14">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
                  <Icon className="h-10 w-10 text-white" />
                </div>
              </div>

              {/* Bottom scrim for text legibility */}
              <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

              {/* Content */}
              <div className="relative z-10 flex flex-col gap-1.5 p-3.5 text-white">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-semibold tracking-tight">{meta.name}</span>
                  {conn ? <BadgeCheck className="h-3.5 w-3.5 fill-white/20 text-white" /> : null}
                </div>

                <p className="line-clamp-1 text-xs leading-snug text-white/75">
                  {conn ? (conn.storeName ?? "Store connected") : meta.tagline}
                </p>

                {conn ? (
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-white/65">
                      {conn.status === "error" ? "Connection error" : conn.storeUrl}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConnectFor(provider)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black shadow transition-transform duration-200 group-hover:scale-105"
                      >
                        Reconnect
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectTarget(conn)}
                        disabled={disconnectMutation.isPending}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white/80 transition-transform duration-200 group-hover:scale-105 hover:bg-white/30"
                      >
                        <Unplug className="h-3 w-3" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-white/65">Not connected</span>
                    <button
                      type="button"
                      onClick={() => setConnectFor(provider)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black shadow transition-transform duration-200 group-hover:scale-105"
                    >
                      Connect
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {connectFor && (
        <ConnectStoreDialog
          provider={connectFor}
          existing={byProvider(connectFor)}
          onClose={() => setConnectFor(null)}
          onConnected={() => {
            invalidate();
            setConnectFor(null);
          }}
        />
      )}

      <ConfirmDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        title="Disconnect store?"
        description={
          disconnectTarget
            ? `This disconnects ${disconnectTarget.storeName ?? disconnectTarget.storeUrl} from SellPilot. Already-imported products stay in your catalog, but you'll need to reconnect to import more.`
            : ""
        }
        confirmLabel="Disconnect"
        destructive
        loading={disconnectMutation.isPending}
        onConfirm={async () => {
          if (!disconnectTarget) return;
          try {
            await disconnectMutation.mutateAsync({ connectionId: disconnectTarget.id });
            toast.success(`Disconnected ${disconnectTarget.storeName ?? "store"}`);
            invalidate();
            setDisconnectTarget(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to disconnect store");
          }
        }}
      />
    </>
  );
}

function ConnectStoreDialog({
  provider,
  existing,
  onClose,
  onConnected,
}: {
  provider: Provider;
  existing?: ConnectionRow;
  onClose: () => void;
  onConnected: () => void;
}) {
  const trpc = useTRPC();
  const meta = PROVIDER_META[provider];
  const connectMutation = useMutation(trpc.storeConnections.connect.mutationOptions());
  const testMutation = useMutation(trpc.storeConnections.test.mutationOptions());
  const [form, setForm] = useState<CredentialsFormState>({
    storeUrl: existing?.storeUrl ?? "",
    ...(provider === "shopify" ? { accessToken: "" } : { consumerKey: "", consumerSecret: "" }),
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; storeName?: string; message?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const set = (key: keyof CredentialsFormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isFormValid = () =>
    form.storeUrl.trim().length > 0 &&
    (provider === "shopify"
      ? !!form.accessToken?.trim()
      : !!form.consumerKey?.trim() && !!form.consumerSecret?.trim());

  const handleTest = async () => {
    if (!isFormValid()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testMutation.mutateAsync({
        provider,
        storeUrl: form.storeUrl.trim(),
        credentials: credentialsPayload(provider, form),
      });
      setTestResult({ ok: res.ok, storeName: res.storeName });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    try {
      await connectMutation.mutateAsync({
        provider,
        storeUrl: form.storeUrl.trim(),
        credentials: credentialsPayload(provider, form),
      });
      toast.success(`${meta.name} store connected`);
      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect store");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {existing ? `Reconnect ${meta.name} store` : `Connect ${meta.name} store`}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {meta.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`${provider}-${field.key}`}>{field.label}</Label>
              <Input
                id={`${provider}-${field.key}`}
                type={field.type}
                value={form[field.key] ?? ""}
                onChange={(e) => set(field.key)(e.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
              />
            </div>
          ))}

          {testResult && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
                testResult.ok
                  ? "border-(--success)/30 bg-(--success)/5 text-(--success)"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>
                {testResult.ok
                  ? `Connected to ${testResult.storeName} — ready to import.`
                  : testResult.message}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={!isFormValid() || testing}>
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            Test Connection
          </Button>
          <Button onClick={handleConnect} disabled={connectMutation.isPending || !isFormValid()}>
            {connectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {existing ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
