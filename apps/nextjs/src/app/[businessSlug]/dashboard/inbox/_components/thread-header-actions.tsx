"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Archive, CheckCircle2, Filter, MoreHorizontal, Star, Headset, Bot } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";

import { InboxFilterSheet } from "./inbox-tabs-bar";

export function ThreadHeaderActions({
  threadId,
  status,
  starred,
  handlingMode,
}: {
  threadId: string;
  status: string;
  starred: boolean;
  handlingMode: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const setStatus = useMutation(trpc.inbox.setStatus.mutationOptions());
  const toggleStar = useMutation(trpc.inbox.toggleStar.mutationOptions());
  const setHandlingMode = useMutation(trpc.inbox.setHandlingMode.mutationOptions());
  const isHuman = handlingMode === "human";

  function updateStatus(next: string) {
    setStatus.mutate({ threadId, status: next as "open" | "ticket" | "resolved" | "archived" }, { onSuccess: () => router.refresh() });
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Take over button — always visible */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-8 gap-1.5", isHuman && "border-primary/40 bg-primary/10 text-primary")}
        disabled={setHandlingMode.isPending}
        onClick={() =>
          setHandlingMode.mutate(
            { threadId, handlingMode: isHuman ? "ai" : "human" },
            { onSuccess: () => router.refresh() },
          )
        }
        title={isHuman ? "Hand this conversation back to the AI" : "Take over this conversation from the AI"}
      >
        {isHuman ? <Headset className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{isHuman ? "You're handling" : "Take over"}</span>
      </Button>

      {/* Star — desktop only */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn("hidden h-8 w-8 sm:inline-flex", starred && "border-primary/40 bg-primary/10 text-primary")}
        disabled={toggleStar.isPending}
        onClick={() => toggleStar.mutate({ threadId, starred: !starred }, { onSuccess: () => router.refresh() })}
        aria-label={starred ? "Unstar" : "Star"}
      >
        <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
      </Button>

      {/* More menu — always visible, contains all actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="More options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            disabled={toggleStar.isPending}
            onSelect={() => toggleStar.mutate({ threadId, starred: !starred }, { onSuccess: () => router.refresh() })}
          >
            <Star className={cn("h-4 w-4 mr-2", starred && "fill-amber-400 text-amber-400")} />
            {starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={setStatus.isPending}
            onSelect={() => updateStatus(status === "resolved" ? "open" : "resolved")}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {status === "resolved" ? "Mark as Open" : "Mark Resolved"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={setStatus.isPending}
            onSelect={() => updateStatus(status === "archived" ? "open" : "archived")}
          >
            <Archive className="h-4 w-4 mr-2" />
            {status === "archived" ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={setStatus.isPending} onSelect={() => updateStatus("open")}>
            Mark as Open
          </DropdownMenuItem>
          <DropdownMenuItem disabled={setStatus.isPending} onSelect={() => updateStatus("ticket")}>
            Mark as Ticket
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Filters — mobile only, opens bottom sheet */}
          <div className="md:hidden">
            <InboxFilterSheet>
              <div
                role="menuitem"
                className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <Filter className="h-4 w-4" />
                Filters
              </div>
            </InboxFilterSheet>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
