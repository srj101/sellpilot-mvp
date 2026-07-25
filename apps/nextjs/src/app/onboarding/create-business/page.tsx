import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OnboardingWizard } from "./_components/onboarding-wizard";

import { Suspense } from "react";

export default async function CreateStorePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify-email");

  return (
    <Suspense fallback={<div>Loading wizard...</div>}>
      <OnboardingWizard userName={session.user.name} />
    </Suspense>
  );
}
