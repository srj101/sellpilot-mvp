import { redirect } from "next/navigation";
import { getSession } from "~/auth/server";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { VerifyEmailClient } from "~/app/_components/auth/verify-email-client";

interface VerifyEmailPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const session = await getSession();
  
  // If not logged in, they can't verify. Redirect to login.
  // Wait, if they click a link on a new device, they might not be logged in.
  // Better-Auth usually allows verifying email without being logged in (via token).
  // But if they just land here without a token and without a session, send them to login.
  
  const params = searchParams ? await searchParams : {};
  const token = typeof params.token === "string" ? params.token : undefined;

  if (!session && !token) {
    redirect("/login");
  }

  if (session?.user.emailVerified) {
    redirect("/dashboard");
  }

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Verify your email"
      description={
        token 
          ? "Verifying your email address..." 
          : "We sent a verification link to your email. Please click it to continue."
      }
    >
      <VerifyEmailClient 
        token={token} 
        email={session?.user.email} 
      />
    </AuthShell>
  );
}
