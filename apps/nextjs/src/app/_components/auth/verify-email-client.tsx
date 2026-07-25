"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Mail, ArrowRight, RefreshCw, Pencil } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Field, FieldLabel } from "@acme/ui/field";
import { Input } from "@acme/ui/input";
import { postAuth, AuthAlert } from "./auth-forms";
import { authClient } from "~/auth/client";

interface AuthNotice {
  tone: "success" | "error";
  message: string;
}

export function VerifyEmailClient({
  token,
  email,
}: {
  token?: string;
  email?: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isVerifying, setIsVerifying] = useState(!!token);
  
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(email ?? "");

  // Auto-verify if token is present
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    
    // Better auth verify email endpoint is /api/auth/verify-email
    const verifyToken = async () => {
      try {
        await postAuth("verify-email", { token });
        if (!isMounted) return;
        setNotice({
          tone: "success",
          message: "Email verified successfully! Redirecting...",
        });
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1500);
      } catch (err) {
        if (!isMounted) return;
        setIsVerifying(false);
        setNotice({
          tone: "error",
          message: err instanceof Error ? err.message : "Invalid or expired verification link.",
        });
      }
    };
    
    void verifyToken();
    
    return () => {
      isMounted = false;
    };
  }, [token, router]);

  const handleResend = () => {
    if (!email) return;
    setNotice(null);
    startTransition(() => {
      void (async () => {
        try {
          await postAuth("send-verification-email", { email });
          setNotice({
            tone: "success",
            message: "Verification email sent. Please check your inbox.",
          });
        } catch (err) {
          setNotice({
            tone: "error",
            message: err instanceof Error ? err.message : "Failed to send email.",
          });
        }
      })();
    });
  };

  const handleChangeEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newEmail || newEmail === email) {
      setIsChangingEmail(false);
      return;
    }
    
    setNotice(null);
    startTransition(() => {
      void (async () => {
        try {
          await authClient.changeEmail({ newEmail, callbackURL: "/verify-email" });
          
          setNotice({
            tone: "success",
            message: "Email updated successfully. Please check your new email for a verification link.",
          });
          
          setIsChangingEmail(false);
          router.refresh();
        } catch (err) {
          setNotice({
            tone: "error",
            message: err instanceof Error ? err.message : "Failed to update email.",
          });
        }
      })();
    });
  };

  if (isVerifying) {
    return (
      <div className="flex flex-col gap-5 sm:gap-6 items-center py-8">
        <LoaderCircle className="size-8 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm font-medium">Verifying your token...</p>
        <AuthAlert notice={notice} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <AuthAlert notice={notice} />
      
      {!isChangingEmail ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground/80 bg-background/60 p-4 rounded-xl border backdrop-blur">
            We sent an email to <span className="font-semibold text-foreground">{email}</span>. Please click the link to verify your account.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <Button
              type="button"
              variant="default"
              size="lg"
              className="w-full rounded-xl"
              disabled={isPending}
              onClick={handleResend}
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="size-4 mr-2" />
              )}
              Resend link
            </Button>
            
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full rounded-xl bg-background/60"
              disabled={isPending}
              onClick={() => setIsChangingEmail(true)}
            >
              <Pencil className="size-4 mr-2" />
              Change email
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleChangeEmail} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="newEmail" className="text-sm font-medium">
              New email address
            </FieldLabel>
            <div className="relative">
              <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="h-11 rounded-xl pl-10"
              />
            </div>
          </Field>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-xl"
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="size-4 mr-2" />
              )}
              Update email
            </Button>
            
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full rounded-xl bg-background/60"
              disabled={isPending}
              onClick={() => setIsChangingEmail(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
