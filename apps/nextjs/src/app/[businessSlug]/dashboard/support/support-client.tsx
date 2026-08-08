"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Inbox, Loader2 } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";
import { useTRPC } from "~/trpc/react";
import { useBusinessSlug } from "~/hooks/use-business-slug";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "Tickets" aren't a separate entity — they're Inbox conversations a staff member flagged
 * via conversationMeta.status = "ticket" (see thread-header-actions.tsx's "Mark as Ticket").
 * This page used to show hardcoded fake data (same 3 tickets for every business, forever);
 * it now reads the same inbox.getInboxData threads the Inbox page itself uses, filtered to
 * that status, and links back into the Inbox to actually work a ticket — no separate
 * ticket-creation flow exists because tickets are created by flagging a real conversation.
 */
export function SupportClient() {
  const trpc = useTRPC();
  const businessSlug = useBusinessSlug();
  const queryClient = useQueryClient();
  const inboxQuery = trpc.inbox.getInboxData.queryOptions({});
  const { data, isPending } = useQuery(inboxQuery);

  const resolveTicket = useMutation(
    trpc.inbox.setStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey });
      },
    }),
  );

  const threads = data?.threads ?? [];
  const tickets = threads.filter((t) => t.status === "ticket");
  const resolvedCount = threads.filter((t) => t.status === "resolved").length;

  return (
    <div className="space-y-6">
      {/* Status breakdown cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="card-hover p-5 flex items-center gap-4">
          <div className="rounded-xl bg-amber-500/10 p-3 text-amber-500 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Active Tickets</p>
            {isPending ? <Skeleton className="mt-1 h-7 w-10" /> : <p className="text-2xl font-bold text-foreground">{tickets.length}</p>}
          </div>
        </Card>

        <Card className="card-hover p-5 flex items-center gap-4">
          <div className="rounded-xl bg-green-500/10 p-3 text-green-500 shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Resolved Conversations</p>
            {isPending ? <Skeleton className="mt-1 h-7 w-10" /> : <p className="text-2xl font-bold text-foreground">{resolvedCount}</p>}
          </div>
        </Card>
      </div>

      {/* Tickets log */}
      <Card className="card-hover">
        <CardHeader className="border-b py-4">
          <CardTitle>Active Tickets</CardTitle>
          <CardDescription>Conversations flagged as tickets from the Inbox — click one to open and reply.</CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          {isPending ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-foreground">No active tickets</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mark a conversation as a ticket from the Inbox to track it here.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">Customer</th>
                    <th className="py-3 font-medium">Channel</th>
                    <th className="py-3 font-medium">Summary</th>
                    <th className="py-3 text-right font-medium">Last Updated</th>
                    <th className="py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 font-medium text-foreground">
                        <Link href={`/${businessSlug}/dashboard/inbox?thread=${t.id}`} className="hover:underline">
                          {t.contactLabel}
                        </Link>
                      </td>
                      <td className="py-3 capitalize text-muted-foreground">{t.platform.replace("_", " ")}</td>
                      <td className="py-3 max-w-xs truncate text-muted-foreground">{t.summary ?? "No summary yet"}</td>
                      <td className="py-3 text-right text-muted-foreground">{formatDate(t.lastMessageAt)}</td>
                      <td className="py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
                          disabled={resolveTicket.isPending}
                          onClick={() =>
                            resolveTicket.mutate({ threadId: t.id, status: "resolved" })
                          }
                        >
                          {resolveTicket.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Resolve
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
