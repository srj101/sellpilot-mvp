"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Facebook,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSeparator,
} from "@acme/ui/field";
import { Input } from "@acme/ui/input";

import { signInWithFacebook, signInWithGoogle } from "~/app/login/actions";

interface AuthNotice {
  tone: "success" | "error";
  message: string;
}

interface AuthResponse {
  url?: string;
  redirect?: boolean;
  status?: boolean;
}

interface AuthErrorPayload {
  message?: string;
  error?: {
    message?: string;
  };
}

function GoogleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function postAuth<TResponse extends AuthResponse>(
  path: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as TResponse &
    AuthErrorPayload;

  if (!res.ok) {
    throw new Error(
      data.message ??
        data.error?.message ??
        "The request could not be completed. Please check the details and try again.",
    );
  }

  return data;
}

function AuthAlert({ notice }: { notice?: AuthNotice | null }) {
  if (!notice) return null;

  const Icon = notice.tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={cn(
        "bg-background/70 flex items-start gap-3 rounded-md border px-3 py-3 text-sm",
        notice.tone === "error" && "border-destructive/40 text-destructive",
        notice.tone === "success" && "border-primary/40 text-foreground",
      )}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="leading-5">{notice.message}</span>
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  name: string;
  autoComplete: string;
  placeholder: string;
  required?: boolean;
  minLength?: number;
  invalid?: boolean;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

function PasswordInput({
  id,
  name,
  autoComplete,
  placeholder,
  required = true,
  minLength = 8,
  invalid = false,
  value,
  onChange,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        aria-invalid={invalid}
        {...(value !== undefined ? { value } : {})}
        {...(onChange ? { onChange } : {})}
        className="h-11 rounded-xl pr-11"
      />
      <button
        aria-label={visible ? "Hide password" : "Show password"}
        className="text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md transition-colors outline-none focus-visible:ring-[3px]"
        type="button"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function SocialButtons() {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <form action={signInWithGoogle}>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full gap-2.5 border-border/80 bg-background/60 text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5"
        >
          <GoogleIcon className="size-4" />
          Google
        </Button>
      </form>

      <form action={signInWithFacebook}>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full gap-2.5 border-border/80 bg-background/60 text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5"
        >
          <Facebook className="size-4 text-[#1877F2]" />
          Facebook
        </Button>
      </form>
    </div>
  );
}

/* ─── Password strength meter ────────────────────────────────── */

type Strength = 0 | 1 | 2 | 3 | 4;

const STRENGTH_LABEL: Record<Strength, string> = {
  0: "Empty",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

function scorePassword(pwd: string): { score: Strength; label: string } {
  if (!pwd) return { score: 0, label: STRENGTH_LABEL[0] };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;
  const safe = (score > 4 ? 4 : score) as Strength;
  return { score: safe, label: STRENGTH_LABEL[safe] };
}

const STRENGTH_BAR_COLOR: Record<Strength, string> = {
  0: "bg-muted",
  1: "bg-red-500",
  2: "bg-amber-500",
  3: "bg-blue-500",
  4: "bg-emerald-500",
};

const STRENGTH_TEXT_COLOR: Record<Strength, string> = {
  0: "text-muted-foreground",
  1: "text-red-500",
  2: "text-amber-500",
  3: "text-blue-500",
  4: "text-emerald-500",
};

function PasswordStrength({ password }: { password: string }) {
  const { score, label } = scorePassword(password);

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= score ? STRENGTH_BAR_COLOR[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      {password && (
        <p
          className={cn(
            "text-[11px] font-medium transition-colors",
            STRENGTH_TEXT_COLOR[score],
          )}
        >
          {label}
          {score < 3 && " — try 12+ chars, mixed case, a number & symbol"}
        </p>
      )}
    </div>
  );
}

export function SignInForm({ notice }: { notice?: AuthNotice | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(() => {
      void (async () => {
        try {
          const data = await postAuth<AuthResponse>("sign-in/email", {
            email: getFormString(formData, "email"),
            password: getFormString(formData, "password"),
            callbackURL: "/dashboard",
            rememberMe: true,
          });

          router.push(data.url ?? "/dashboard");
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Sign in failed. Please try again.",
          );
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <SocialButtons />
      <FieldSeparator className="text-[11px] uppercase tracking-wider">
        or continue with email
      </FieldSeparator>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthAlert notice={notice} />
        <AuthAlert
          notice={error ? { tone: "error", message: error } : undefined}
        />

        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="email" className="text-sm font-medium">
            Email address
          </FieldLabel>
          <div className="relative">
            <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              aria-invalid={!!error}
              className="h-11 rounded-xl pl-10"
            />
          </div>
        </Field>

        <Field data-invalid={!!error}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="password" className="text-sm font-medium">
              Password
            </FieldLabel>
            <Link
              className="text-primary text-xs font-medium underline-offset-4 hover:underline"
              href="/forgot-password"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            invalid={!!error}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm transition-all hover:brightness-110"
          disabled={isPending}
        >
          {isPending ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <ArrowRight data-icon="inline-start" />
          )}
          Sign in
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        New to SellPilot?{" "}
        <Link
          className="text-primary font-semibold underline-offset-4 hover:underline"
          href="/signup"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pwd = getFormString(formData, "password");
    const confirmPwd = getFormString(formData, "confirmPassword");

    setError(null);

    if (pwd !== confirmPwd) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await postAuth<AuthResponse>("sign-up/email", {
            name: getFormString(formData, "name"),
            email: getFormString(formData, "email"),
            password: pwd,
            callbackURL: "/dashboard",
            rememberMe: true,
          });

          router.push("/dashboard");
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Account creation failed. Please try again.",
          );
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <SocialButtons />
      <FieldSeparator className="text-[11px] uppercase tracking-wider">
        or create with email
      </FieldSeparator>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthAlert
          notice={error ? { tone: "error", message: error } : undefined}
        />

        {/* Name + Email in one row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="name" className="text-sm font-medium">
              Full name
            </FieldLabel>
            <div className="relative">
              <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Sarah Lee"
                required
                aria-invalid={!!error}
                className="h-11 rounded-xl pl-10"
              />
            </div>
          </Field>

          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="email" className="text-sm font-medium">
              Work email
            </FieldLabel>
            <div className="relative">
              <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                aria-invalid={!!error}
                className="h-11 rounded-xl pl-10"
              />
            </div>
          </Field>
        </div>

        {/* Password (stacked column) */}
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="password" className="text-sm font-medium">
            Password
          </FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            invalid={!!error}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <PasswordStrength password={password} />
        </Field>

        {/* Confirm password (stacked column) */}
        <Field data-invalid={!!error}>
          <FieldLabel
            htmlFor="confirmPassword"
            className="text-sm font-medium"
          >
            Confirm password
          </FieldLabel>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Repeat your password"
            invalid={!!error}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm transition-all hover:brightness-110"
          disabled={isPending}
        >
          {isPending ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <ArrowRight data-icon="inline-start" />
          )}
          Create account
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link
          className="text-primary font-semibold underline-offset-4 hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setNotice(null);

    startTransition(() => {
      void (async () => {
        try {
          await postAuth<AuthResponse>("request-password-reset", {
            email: getFormString(formData, "email"),
            redirectTo: "/reset-password",
          });

          setNotice({
            tone: "success",
            message:
              "If this email exists, a reset link has been sent. In local development, check your terminal for the reset URL.",
          });
        } catch (cause) {
          setNotice({
            tone: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "Could not send a reset link. Please try again.",
          });
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthAlert notice={notice} />

        <Field data-invalid={notice?.tone === "error"}>
          <FieldLabel htmlFor="email" className="text-sm font-medium">
            Account email
          </FieldLabel>
          <div className="relative">
            <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              aria-invalid={notice?.tone === "error"}
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <FieldDescription className="text-xs">
            We will send a one-time link that expires in 60 minutes.
          </FieldDescription>
        </Field>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm transition-all hover:brightness-110"
          disabled={isPending}
        >
          {isPending ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <Mail data-icon="inline-start" />
          )}
          Send reset link
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Remembered it?{" "}
        <Link
          className="text-primary font-semibold underline-offset-4 hover:underline"
          href="/login"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({
  token,
  tokenError,
}: {
  token?: string;
  tokenError?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    tokenError === "INVALID_TOKEN"
      ? "This reset link is invalid or has expired. Request a new password reset link."
      : null,
  );
  const hasToken = !!token;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newPassword = getFormString(formData, "newPassword");
    const confirmPassword = getFormString(formData, "confirmPassword");

    setError(null);

    if (!token) {
      setError("This reset link is missing a token. Request a new reset link.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await postAuth<AuthResponse>("reset-password", {
            token,
            newPassword,
          });

          router.push("/login?reset=success");
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not reset your password. Please request a new link.",
          );
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthAlert
          notice={error ? { tone: "error", message: error } : undefined}
        />

        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="newPassword" className="text-sm font-medium">
            New password
          </FieldLabel>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            placeholder="Set a new password"
            invalid={!!error}
          />
        </Field>

        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm new password
          </FieldLabel>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Repeat the new password"
            invalid={!!error}
          />
          <FieldError>{error}</FieldError>
        </Field>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm transition-all hover:brightness-110"
          disabled={isPending || !hasToken}
        >
          {isPending ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <LockKeyhole data-icon="inline-start" />
          )}
          Update password
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Need another link?{" "}
        <Link
          className="text-primary font-semibold underline-offset-4 hover:underline"
          href="/forgot-password"
        >
          Request reset
        </Link>
      </p>
    </div>
  );
}
