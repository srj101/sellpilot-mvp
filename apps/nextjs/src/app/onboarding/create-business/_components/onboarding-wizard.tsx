"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { BusinessChatIntake } from "./business-chat-intake";
import { StepConnectChannels } from "./step-connect-channels";
import { StepAddProducts } from "./step-add-products";
import { StepTrialStarted } from "./step-trial-started";

export function OnboardingWizard({ userName }: { userName: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlStep = searchParams.get("step") as "chat" | "connect" | "products" | "trial" | null;
  const urlSlug = searchParams.get("slug");
  const urlTrialEndsAt = searchParams.get("trialEndsAt");

  const [step, setStep] = useState<"chat" | "connect" | "products" | "trial">(urlStep ?? "chat");
  const [businessSlug, setBusinessSlug] = useState<string | null>(urlSlug ?? null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(urlTrialEndsAt ?? null);

  // Update URL silently when state changes without triggering Next.js re-renders
  useEffect(() => {
    if (step === "chat") return; // Don't show URL params for the first step

    const params = new URLSearchParams(searchParams.toString());
    params.set("step", step);
    if (businessSlug) {
      params.set("slug", businessSlug);
    }
    if (trialEndsAt) {
      params.set("trialEndsAt", trialEndsAt);
    }

    const newUrl = `${pathname}?${params.toString()}`;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", newUrl);
    }
  }, [step, businessSlug, trialEndsAt, pathname, searchParams]);

  if (step === "chat") {
    return (
      <BusinessChatIntake
        userName={userName}
        onComplete={(slug, newTrialEndsAt) => {
          setBusinessSlug(slug);
          if (newTrialEndsAt) setTrialEndsAt(newTrialEndsAt);
          setStep("connect");
        }}
      />
    );
  }

  if (step === "connect") {
    return (
      <StepConnectChannels 
        businessSlug={businessSlug!} 
        onNext={() => setStep("products")} 
      />
    );
  }

  if (step === "products") {
    return (
      <StepAddProducts 
        businessSlug={businessSlug!} 
        onNext={() => setStep("trial")} 
      />
    );
  }

  if (step === "trial") {
    return (
      <StepTrialStarted
        businessSlug={businessSlug!}
        trialEndsAt={trialEndsAt ?? undefined}
      />
    );
  }

  return null;
}
