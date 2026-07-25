import { redirect } from "next/navigation";

import { SignUpForm } from "~/app/_components/auth/auth-forms";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";

interface SignUpPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : {};
  const email = getSearchValue(params, "email");
  const invitation = getSearchValue(params, "invitation");

  return (
    <AuthShell
      eyebrow="Start free · 14-day Pro trial"
      title="Create your SellPilot workspace"
      description="Spin up your AI agent, connect your channels, and start selling — no credit card required."
    >
      <SignUpForm defaultEmail={email} invitationId={invitation} />
    </AuthShell>
  );
}
