"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, PlugZap, PowerOff, Trash2 } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

export interface ConnectedPageItem {
  id: string;
  name: string;
  externalId?: string | null;
  webhookStatus: string;
  connectedAt: Date | string;
  /** "active" | "paused" — see meta_connection.status. */
  status: string;
  pausedAt?: Date | string | null;
}

/**
 * Three states, one row:
 *
 *   Connected     → Disconnect
 *   Paused        → Reconnect · Remove permanently
 *   Not connected → (this list is empty; Connect lives on the page below)
 *
 * Disconnect is reversible and cheap, so it acts immediately. Remove permanently drops the
 * row and unattributes the thread history, so it asks first — and it is reachable only
 * from the paused state, which makes the destructive path a deliberate two-step.
 */
export function ConnectedPagesList({
  pages,
  emptyLabel,
}: {
  pages: ConnectedPageItem[];
  emptyLabel: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const pauseChannel = useMutation(trpc.integrations.pauseChannel.mutationOptions());
  const resumeChannel = useMutation(trpc.integrations.resumeChannel.mutationOptions());
  const removeChannel = useMutation(trpc.integrations.removeChannel.mutationOptions());

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function run(
    connectionId: string,
    action: () => Promise<unknown>,
    onDone?: () => void,
  ) {
    setBusyId(connectionId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });

    try {
      await action();
      onDone?.();
      router.refresh();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [connectionId]: err instanceof Error ? err.message : "Something went wrong — try again.",
      }));
    } finally {
      setBusyId(null);
    }
  }

  const visiblePages = pages.filter((page) => !removedIds.has(page.id));

  if (visiblePages.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visiblePages.map((page) => {
        const isBusy = busyId === page.id;
        const isPaused = page.status === "paused";
        const error = errors[page.id];
        const isConfirming = confirmingId === page.id;

        return (
          <li
            key={page.id}
            className={`flex flex-col gap-2 rounded-xl border p-4 ${
              isPaused ? "bg-muted/40 border-dashed" : "bg-secondary/30"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={`truncate text-sm font-semibold ${
                      isPaused ? "text-muted-foreground" : ""
                    }`}
                  >
                    {page.name}
                  </p>
                  {isPaused ? (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Paused
                    </Badge>
                  ) : null}
                </div>

                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {page.externalId ? <span>ID: {page.externalId}</span> : null}
                  <span className="flex items-center gap-1.5">
                    Webhook
                    <Badge
                      variant={page.webhookStatus === "subscribed" ? "success" : "secondary"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {page.webhookStatus}
                    </Badge>
                  </span>
                  <span>Connected {new Date(page.connectedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Only the single Disconnect button sits inline. The paused pair is far too
                  wide for this card — side by side they crushed the details column into a
                  one-word-per-line strip — so they get their own full-width row below. */}
              {!isPaused ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={isBusy}
                  onClick={() =>
                    void run(page.id, () => pauseChannel.mutateAsync({ connectionId: page.id }))
                  }
                >
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PowerOff className="h-4 w-4" />
                  )}
                  Disconnect
                </Button>
              ) : null}
            </div>

            {isPaused ? (
              <p className="text-muted-foreground text-xs">
                Messages still arrive and stay in your inbox, but nothing is replied to.
                Reconnect to resume — no re-authentication needed.
              </p>
            ) : page.webhookStatus !== "subscribed" ? (
              <p className="text-destructive text-xs">
                Auto-reply isn't active for this page yet — missing permissions. Remove and
                reconnect it once app permissions are fixed.
              </p>
            ) : null}

            {isPaused ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    void run(page.id, () => resumeChannel.mutateAsync({ connectionId: page.id }))
                  }
                >
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlugZap className="h-4 w-4" />
                  )}
                  Reconnect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isBusy}
                  onClick={() => setConfirmingId(isConfirming ? null : page.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove permanently
                </Button>
              </div>
            ) : null}

            {isConfirming ? (
              <div className="border-destructive/20 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-destructive text-xs">
                  This deletes the connection for good. Past messages stay in your inbox but
                  are no longer linked to this page, and reconnecting means going through
                  Facebook login again. Disconnecting is reversible — this isn't.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBusy}
                    onClick={() =>
                      void run(
                        page.id,
                        () => removeChannel.mutateAsync({ connectionId: page.id }),
                        () => {
                          setConfirmingId(null);
                          setRemovedIds((prev) => new Set(prev).add(page.id));
                        },
                      )
                    }
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Yes, remove permanently
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => setConfirmingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
