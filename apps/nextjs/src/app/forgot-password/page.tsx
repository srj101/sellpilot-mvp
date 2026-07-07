import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "~/app/_components/auth/auth-forms";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";

export default async function ForgotPasswordPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset access without losing momentum"
      description="Enter your account email and we will send a short-lived reset link for your SellPilot workspace."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
