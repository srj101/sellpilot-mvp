"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, XCircle } from "lucide-react";

import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

type FlowStep = "starting" | "qr" | "authenticating" | "ready" | "error";

export default function WhatsAppConnectPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const startOpenWASession = useMutation(trpc.integrations.startOpenWASession.mutationOptions());
  const fetchOpenWAQr = useMutation(trpc.integrations.fetchOpenWAQr.mutationOptions());
  const checkOpenWAStatus = useMutation(trpc.integrations.checkOpenWAStatus.mutationOptions());
  const saveOpenWAConnection = useMutation(trpc.integrations.saveOpenWAConnection.mutationOptions());
  const [step, setStep] = useState<FlowStep>("starting");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [pushName, setPushName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Boot the session and enter QR phase
  const initSession = useCallback(async () => {
    if (!isMounted.current) return;
    setStep("starting");
    setError(null);

    const result = await startOpenWASession.mutateAsync();
    if (!isMounted.current) return;
    if (!result.ok) {
      setError(result.error);
      setStep("error");
      return;
    }

    // Start polling for QR / status
    setStep("qr");

    // First, try to fetch the QR immediately
    const qr = await fetchOpenWAQr.mutateAsync();
    if (!isMounted.current) return;
    if (qr.ok) setQrCode(qr.qrCode);

    // Stop any existing polling before starting a new one
    stopPolling();

    // Then poll status + QR every 3 seconds
    pollRef.current = setInterval(() => {
      void (async () => {
        if (!isMounted.current) {
          stopPolling();
          return;
        }

        const status = await checkOpenWAStatus.mutateAsync();
        if (!isMounted.current) return;
        if (!status.ok) return;

        if (status.status === "ready") {
          stopPolling();
          setPhone(status.phone);
          setPushName(status.pushName);
          setStep("ready");

          // Auto-save the connection
          setSaving(true);
          const save = await saveOpenWAConnection.mutateAsync();
          if (!isMounted.current) return;
          setSaving(false);
          if (!save.ok) {
            setError(save.error);
            setStep("error");
          }
          return;
        }

        if (status.status === "authenticating") {
          setStep("authenticating");
          return;
        }

        if (status.status === "failed") {
          stopPolling();
          setError("Session authentication failed. Please try again.");
          setStep("error");
          return;
        }

        // Still in qr_ready — refresh QR
        if (status.status === "qr_ready") {
          const refreshedQr = await fetchOpenWAQr.mutateAsync();
          if (!isMounted.current) return;
          if (refreshedQr.ok) setQrCode(refreshedQr.qrCode);
        }
      })();
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutateAsync references are stable per hook instance
  }, [stopPolling]);

  useEffect(() => {
    isMounted.current = true;
    void initSession();
    return () => {
      isMounted.current = false;
      stopPolling();
    };
  }, [initSession, stopPolling]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-2xl border p-8 shadow-xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.push("/dashboard/integrations")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Connect WhatsApp
            </h1>
            <p className="text-muted-foreground text-sm">
              Scan the QR code with your phone
            </p>
          </div>
        </div>

        {/* Starting */}
        {step === "starting" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="relative">
              <div className="h-16 w-16 animate-pulse rounded-2xl bg-[#25D366]/20" />
              <Loader2 className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-[#25D366]" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">
              Initializing WhatsApp session…
            </p>
          </div>
        )}

        {/* QR Code */}
        {step === "qr" && (
          <div className="flex flex-col items-center gap-6">
            <div className="relative overflow-hidden rounded-xl border-2 border-[#25D366]/30 bg-white p-3 shadow-lg shadow-[#25D366]/5">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="WhatsApp QR Code"
                  className="h-64 w-64"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center">
                  <QrCode className="h-16 w-16 animate-pulse text-gray-300" />
                </div>
              )}
            </div>

            <div className="space-y-2 text-center">
              <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#25D366]">
                <Smartphone className="h-4 w-4" />
                Waiting for scan…
              </div>
              <ol className="text-muted-foreground space-y-1 text-xs">
                <li>1. Open WhatsApp on your phone</li>
                <li>
                  2. Go to{" "}
                  <span className="font-medium">
                    Settings → Linked Devices
                  </span>
                </li>
                <li>3. Tap "Link a Device" and scan the code</li>
              </ol>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const qr = await fetchOpenWAQr.mutateAsync();
                if (qr.ok) setQrCode(qr.qrCode);
              }}
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh QR
            </Button>
          </div>
        )}

        {/* Authenticating */}
        {step === "authenticating" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="relative">
              <div className="h-16 w-16 animate-pulse rounded-2xl bg-[#25D366]/20" />
              <Loader2 className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-[#25D366]" />
            </div>
            <p className="text-sm font-medium text-[#25D366]">
              QR scanned! Authenticating…
            </p>
          </div>
        )}

        {/* Ready */}
        {step === "ready" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]/15">
              <CheckCircle2 className="h-10 w-10 text-[#25D366]" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">
                {saving ? "Saving…" : "WhatsApp Connected!"}
              </p>
              {phone && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {pushName ? `${pushName} · ` : ""}+{phone}
                </p>
              )}
            </div>
            <Button
              className="mt-2 gap-2 bg-[#25D366] text-white hover:bg-[#1faa52]"
              onClick={() => router.push("/dashboard/integrations")}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {saving ? "Saving connection…" : "Done"}
            </Button>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15">
              <XCircle className="text-destructive h-10 w-10" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Connection Failed</p>
              {error && (
                <p className="text-muted-foreground mt-1 max-w-xs text-sm">
                  {error}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void initSession()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push("/dashboard/integrations")}
              >
                Go Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
