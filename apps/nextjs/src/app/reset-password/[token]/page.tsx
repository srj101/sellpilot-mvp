import { redirect } from "next/navigation";

import { ResetPasswordForm } from "~/app/_components/auth/auth-forms";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";

interface ResetPasswordTokenPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function ResetPasswordTokenPage({
  params,
}: ResetPasswordTokenPageProps) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const { token } = await params;

  return (
    <AuthShell
      eyebrow="New password"
      title="Create a stronger way back in"
      description="Set a fresh password for your SellPilot account. The reset link expires after 60 minutes."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
