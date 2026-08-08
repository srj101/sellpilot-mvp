"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Archive, CheckCircle2, Loader2, Headset, RotateCcw, Tag } from "lucide-react";

import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";

export function ThreadHeaderActions({
  threadId,
  status,
  handlingMode,
}: {
  threadId: string;
  status: string;
  handlingMode: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const setStatus = useMutation(trpc.inbox.setStatus.mutationOptions());
  const setHandlingMode = useMutation(trpc.inbox.setHandlingMode.mutationOptions());
  const isHuman = handlingMode === "human";

  function updateStatus(next: string) {
    setStatus.mutate({ threadId, status: next as "open" | "ticket" | "resolved" | "archived" }, { onSuccess: () => router.refresh() });
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Take Over / Hand Back */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-8.5 gap-1.5 px-3 text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-2xs",
          isHuman
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50"
            : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50"
        )}
        disabled={setHandlingMode.isPending}
        onClick={() =>
          setHandlingMode.mutate(
            { threadId, handlingMode: isHuman ? "ai" : "human" },
            { onSuccess: () => router.refresh() },
          )
        }
        title={isHuman ? "Hand back to AI" : "Take over from AI"}
      >
        {setHandlingMode.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isHuman ? (
          <RotateCcw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Headset className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="hidden md:inline">{isHuman ? "Hand Back" : "Take Over"}</span>
      </Button>

      {/* Resolve Ticket — only when flagged as ticket */}
      {status === "ticket" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8.5 gap-1.5 px-3 text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-2xs border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50"
          disabled={setStatus.isPending}
          onClick={() => updateStatus("resolved")}
          title="Resolve ticket"
        >
          {setStatus.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden md:inline">Resolve</span>
        </Button>
      )}

      {/* Archive / Unarchive */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8.5 gap-1.5 px-3 text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-2xs border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20 hover:border-slate-500/50"
        disabled={setStatus.isPending}
        onClick={() => updateStatus(status === "archived" ? "open" : "archived")}
        title={status === "archived" ? "Unarchive" : "Archive"}
      >
        {setStatus.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
        <span className="hidden md:inline">{status === "archived" ? "Unarchive" : "Archive"}</span>
      </Button>

      {/* Mark as Support Ticket */}
      {(status === "open" || status === "resolved") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8.5 gap-1.5 px-3 text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-2xs border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50"
          disabled={setStatus.isPending}
          onClick={() => updateStatus("ticket")}
          title="Flag as support ticket"
        >
          {setStatus.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Tag className="h-3.5 w-3.5" />
          )}
          <span className="hidden md:inline">Ticket</span>
        </Button>
      )}
    </div>
  );
}
