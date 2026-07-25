"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Archive, MoreHorizontal, Star, CheckCircle2 } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";

const MORE_OPTIONS = [
  { value: "open", label: "Mark as Open" },
  { value: "ticket", label: "Mark as Ticket" },
] as const;

function IconButton({
  active,
  onClick,
  disabled,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("h-8 w-8", active && "border-primary/40 bg-primary/10 text-primary")}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

export function ThreadHeaderActions({
  threadId,
  status,
  starred,
}: {
  threadId: string;
  status: string;
  starred: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const setStatus = useMutation(trpc.inbox.setStatus.mutationOptions());
  const toggleStar = useMutation(trpc.inbox.toggleStar.mutationOptions());

  function updateStatus(next: string) {
    setStatus.mutate({ threadId, status: next as "open" | "ticket" | "resolved" | "archived" }, { onSuccess: () => router.refresh() });
  }

  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        label={starred ? "Unstar conversation" : "Star conversation"}
        active={starred}
        disabled={toggleStar.isPending}
        onClick={() => toggleStar.mutate({ threadId, starred: !starred }, { onSuccess: () => router.refresh() })}
      >
        <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
      </IconButton>

      <IconButton
        label="Mark resolved"
        active={status === "resolved"}
        disabled={setStatus.isPending}
        onClick={() => updateStatus(status === "resolved" ? "open" : "resolved")}
      >
        <CheckCircle2 className="h-4 w-4" />
      </IconButton>

      <IconButton
        label="Archive conversation"
        active={status === "archived"}
        disabled={setStatus.isPending}
        onClick={() => updateStatus(status === "archived" ? "open" : "archived")}
      >
        <Archive className="h-4 w-4" />
      </IconButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="More status options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {MORE_OPTIONS.map((opt) => (
            <DropdownMenuItem key={opt.value} disabled={setStatus.isPending} onSelect={() => updateStatus(opt.value)}>
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
