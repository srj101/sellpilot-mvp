import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { LoginCard } from "./_components/login-card";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <LoginCard />
    </main>
  );
}
