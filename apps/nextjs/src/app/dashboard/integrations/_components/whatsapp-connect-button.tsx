"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";

import { Button } from "@acme/ui/button";

import { env } from "~/env";

import { completeWhatsAppSignup } from "../actions";

interface FacebookSDK {
  init(options: {
    appId: string;
    version: string;
    xfbml: boolean;
    autoLogAppEvents: boolean;
  }): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      redirect_uri: string;
      extras: {
        setup: Record<string, never>;
        featureType: string;
        sessionInfoVersion: string;
      };
    },
  ): void;
}

interface WhatsAppSignupMessage {
  type?: string;
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
  };
}

declare global {
  interface Window {
    FB?: FacebookSDK;
    fbAsyncInit: () => void;
  }
}

function isWhatsAppSignupMessage(value: unknown): value is WhatsAppSignupMessage {
  return typeof value === "object" && value !== null;
}

/**
 * Client component that loads the Facebook SDK and launches
 * WhatsApp Embedded Signup when clicked.
 *
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup
 */
export function WhatsAppConnectButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const signupIds = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const sdkLoaded = useRef(false);

  useEffect(() => {
    if (sdkLoaded.current) return;
    sdkLoaded.current = true;

    const appId = env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    if (!appId) return;

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        version: "v25.0",
        xfbml: true,
        autoLogAppEvents: true,
      });
    };

    // Load Facebook SDK if not already loaded
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    // Listen for Embedded Signup completion events
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes("facebook.com")) return;

      try {
        const data: unknown = JSON.parse(String(event.data));

        if (
          isWhatsAppSignupMessage(data) &&
          data.type === "WA_EMBEDDED_SIGNUP" &&
          data.event === "FINISH"
        ) {
          signupIds.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
          };
        }
      } catch {
        // Non-JSON message from Facebook iframe, ignore
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleConnect() {
    const configId = env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID;
    const redirectUri =
      env.NEXT_PUBLIC_WHATSAPP_REDIRECT_URI ??
      `${window.location.origin}/dashboard/integrations`;

    if (!window.FB) {
      console.error("Facebook SDK not loaded");
      return;
    }

    if (!configId) {
      console.error("Missing NEXT_PUBLIC_WHATSAPP_CONFIG_ID");
      return;
    }

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) return;

        startTransition(async () => {
          const result = await completeWhatsAppSignup({
            code,
            redirectUri,
            ...signupIds.current,
          });

          if (result.ok) {
            router.refresh();
          }
        });
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        redirect_uri: redirectUri,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    );
  }

  return (
    <Button
      size="sm"
      className="w-full"
      onClick={handleConnect}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Link2 className="mr-2 h-4 w-4" />
      )}
      {pending ? "Connecting..." : "Connect"}
    </Button>
  );
}
