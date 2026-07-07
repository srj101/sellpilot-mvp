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
      eyebrow="Start selling smarter"
      title="Create your SellPilot workspace"
      description="Open a secure account, then connect Facebook, Instagram, and WhatsApp from the dashboard."
    >
      <SignUpForm />
    </AuthShell>
  );
}
