"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, UserPlus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { useTRPC } from "~/trpc/react";

export function AssignAgentButton({
  threadId,
  assignedMemberId,
}: {
  threadId: string;
  assignedMemberId: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const membersQuery = useQuery(trpc.roles.listMembers.queryOptions());
  const assignMember = useMutation(trpc.inbox.assignMember.mutationOptions());

  const members = membersQuery.data?.members ?? [];
  const assigned = members.find((m) => m.id === assignedMemberId);

  function handleAssign(memberId: string | null) {
    assignMember.mutate({ threadId, memberId }, { onSuccess: () => router.refresh() });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary"
        >
          <UserPlus className="h-3 w-3" />
          {assigned ? `Assigned to ${assigned.name}` : "Assign Agent"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {members.length <= 1 ? (
          <DropdownMenuItem disabled>Invite teammates from Roles & Permissions first</DropdownMenuItem>
        ) : (
          <>
            {members.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => handleAssign(m.id)}>
                {m.id === assignedMemberId && <Check className="mr-1.5 h-3.5 w-3.5" />}
                {m.name} {m.isYou && "(You)"}
              </DropdownMenuItem>
            ))}
            {assignedMemberId && (
              <DropdownMenuItem onSelect={() => handleAssign(null)}>Unassign</DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
