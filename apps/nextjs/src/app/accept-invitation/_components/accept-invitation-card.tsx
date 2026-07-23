"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";
import { useTRPC } from "~/trpc/react";

export function AcceptInvitationCard({
  invitationId,
  organizationName,
}: {
  invitationId: string;
  organizationName: string;
}) {
  const trpc = useTRPC();
  const acceptInvitation = useMutation(trpc.roles.acceptInvitation.mutationOptions());

  return (
    <Button
      className="w-full gap-1.5"
      disabled={acceptInvitation.isPending}
      onClick={() =>
        acceptInvitation.mutate(
          { invitationId },
          {
            onSuccess: (data) => {
              toast.success(`You've joined ${organizationName}`);
              // Hard navigation (not router.push) so the new membership/active-org
              // state is picked up fresh, matching the store-switch pattern used
              // in onboarding — the client query cache doesn't auto-scope by tenant.
              window.location.href = data.organizationSlug
                ? `/${data.organizationSlug}/dashboard`
                : "/dashboard";
            },
            onError: (err) => toast.error(err.message),
          },
        )
      }
    >
      <CheckCircle2 className="h-4 w-4" />
      {acceptInvitation.isPending ? "Joining..." : `Accept & join ${organizationName}`}
    </Button>
  );
}
