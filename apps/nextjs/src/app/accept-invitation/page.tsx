import Link from "next/link";
import { headers } from "next/headers";

import { Button } from "@acme/ui/button";
import { AuthShell } from "~/app/_components/auth/auth-shell";
import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { AcceptInvitationCard } from "./_components/accept-invitation-card";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const session = await getSession();

  if (!id) {
    return (
      <AuthShell eyebrow="Team invite" title="Invitation not found" description="This invite link is missing its id.">
        <Link href="/login"><Button className="w-full">Back to sign in</Button></Link>
      </AuthShell>
    );
  }

  const caller = await createCaller(await headers());
  const details = await caller.roles.getInvitationDetails({ invitationId: id });

  if (!details) {
    return (
      <AuthShell eyebrow="Team invite" title="Invitation not found" description="This invite may have already been used or cancelled.">
        <Link href="/login"><Button className="w-full">Back to sign in</Button></Link>
      </AuthShell>
    );
  }

  if (details.status !== "pending") {
    return (
      <AuthShell eyebrow="Team invite" title="Invitation already used" description={`This invitation to join ${details.organizationName} has already been ${details.status}.`}>
        <Link href="/login"><Button className="w-full">Back to sign in</Button></Link>
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell
        eyebrow="Team invite"
        title={`Join ${details.organizationName} on SellPilot`}
        description={`You've been invited as ${details.role ?? "a team member"}. Sign in or create an account with ${details.email} to accept, then come back to this link.`}
      >
        <div className="flex flex-col gap-2.5">
          <Link href={`/login?email=${encodeURIComponent(details.email)}`}><Button className="w-full">Sign in</Button></Link>
          <Link href={`/signup?email=${encodeURIComponent(details.email)}`}><Button variant="outline" className="w-full">Create an account</Button></Link>
        </div>
      </AuthShell>
    );
  }

  if (session.user.email !== details.email) {
    return (
      <AuthShell
        eyebrow="Team invite"
        title="Wrong account"
        description={`This invitation was sent to ${details.email}, but you're signed in as ${session.user.email}. Sign out and try again with the invited email.`}
      >
        <Link href="/login"><Button className="w-full">Switch account</Button></Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Team invite"
      title={`Join ${details.organizationName} on SellPilot`}
      description={`You've been invited as ${details.role ?? "a team member"}.`}
    >
      <AcceptInvitationCard invitationId={id} organizationName={details.organizationName} />
    </AuthShell>
  );
}
