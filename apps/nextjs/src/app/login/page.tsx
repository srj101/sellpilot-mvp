import { redirect } from "next/navigation";

import { SignInForm } from "~/app/_components/auth/auth-forms";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : {};
  const reset = getSearchValue(params, "reset");

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your command center"
      description="Pick up where you left off — your AI agent, inbox, and orders are waiting."
    >
      <SignInForm
        notice={
          reset === "success"
            ? {
                tone: "success",
                message: "Your password has been updated. Sign in to continue.",
              }
            : undefined
        }
      />
    </AuthShell>
  );
}
