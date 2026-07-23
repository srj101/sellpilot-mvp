"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

export interface ConnectedPageItem {
  id: string;
  name: string;
  externalId?: string | null;
  webhookStatus: string;
  connectedAt: Date | string;
}

export function ConnectedPagesList({
  pages,
  emptyLabel,
}: {
  pages: ConnectedPageItem[];
  emptyLabel: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const disconnectChannel = useMutation(
    trpc.integrations.disconnectChannel.mutationOptions(),
  );
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleRemove(connectionId: string) {
    setRemovingId(connectionId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });

    try {
      await disconnectChannel.mutateAsync({ connectionId });
      // Hide it immediately instead of waiting on the server round-trip.
      setRemovedIds((prev) => new Set(prev).add(connectionId));
      router.refresh();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [connectionId]:
          err instanceof Error ? err.message : "Failed to remove — try again.",
      }));
    } finally {
      setRemovingId(null);
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
        const isRemoving = removingId === page.id;
        const error = errors[page.id];

        return (
          <li
            key={page.id}
            className="bg-secondary/30 flex flex-col gap-2 rounded-xl border p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{page.name}</p>
                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {page.externalId ? <span>ID: {page.externalId}</span> : null}
                  <span className="flex items-center gap-1.5">
                    Webhook
                    <Badge
                      variant={
                        page.webhookStatus === "subscribed"
                          ? "success"
                          : "secondary"
                      }
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {page.webhookStatus}
                    </Badge>
                  </span>
                  <span>
                    Connected {new Date(page.connectedAt).toLocaleDateString()}
                  </span>
                </div>
                {page.webhookStatus !== "subscribed" ? (
                  <p className="text-destructive mt-1.5 text-xs">
                    Auto-reply isn't active for this page yet — missing
                    permissions. Remove and reconnect it once app permissions
                    are fixed.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                disabled={isRemoving}
                onClick={() => void handleRemove(page.id)}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remove
              </Button>
            </div>
            {error ? (
              <p className="text-destructive text-xs">{error}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
