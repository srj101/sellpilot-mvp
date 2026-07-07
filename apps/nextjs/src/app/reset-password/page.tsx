import { redirect } from "next/navigation";

import { ResetPasswordForm } from "~/app/_components/auth/auth-forms";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";

interface ResetPasswordPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : {};

  return (
    <AuthShell
      eyebrow="New password"
      title="Create a stronger way back in"
      description="Set a fresh password for your SellPilot account. The reset link expires after 60 minutes."
    >
      <ResetPasswordForm
        token={getSearchValue(params, "token")}
        tokenError={getSearchValue(params, "error")}
      />
    </AuthShell>
  );
}
