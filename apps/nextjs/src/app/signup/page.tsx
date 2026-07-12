import { redirect } from "next/navigation";

import { SignUpForm } from "~/app/_components/auth/auth-forms";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";

export default async function SignUpPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <AuthShell
      eyebrow="Start free · 14-day Pro trial"
      title="Create your SellPilot workspace"
      description="Spin up your AI agent, connect your channels, and start selling — no credit card required."
    >
      <SignUpForm />
    </AuthShell>
  );
}
