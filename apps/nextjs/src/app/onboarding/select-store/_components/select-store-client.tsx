"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, LogOut, Mail, Plus, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";
import { useTRPC } from "~/trpc/react";
import { signOut } from "~/app/[storeSlug]/dashboard/(home)/actions";

export function SelectStoreClient() {
  const trpc = useTRPC();

  const storesQuery = useQuery(trpc.org.listMine.queryOptions());
  const invitationsQuery = useQuery(trpc.roles.listMyInvitations.queryOptions());

  const setActive = useMutation(trpc.org.setActive.mutationOptions());
  const acceptInvitation = useMutation(trpc.roles.acceptInvitation.mutationOptions());
  const rejectInvitation = useMutation(trpc.roles.rejectInvitation.mutationOptions());

  function enterStore(organizationId: string, slug: string) {
    setActive.mutate(
      { organizationId },
      {
        // Hard navigation, not router.push: switching stores must not carry over any
        // client-side cached query data (React Query cache isn't keyed per-store) —
        // a full reload guarantees a clean slate for the new store.
        onSuccess: () => { window.location.href = `/${slug}/dashboard`; },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function handleAccept(invitationId: string) {
    acceptInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => {
          toast.success("Invitation accepted");
          storesQuery.refetch();
          invitationsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function handleReject(invitationId: string) {
    rejectInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => {
          toast.success("Invitation declined");
          invitationsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const stores = storesQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Choose a store</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick which store you'd like to work in.</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </Button>
        </form>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Pending Invitations</h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <Card key={inv.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{inv.organizationName}</p>
                      <p className="text-xs text-muted-foreground capitalize">Invited as {inv.customRoleKey ?? inv.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1" disabled={rejectInvitation.isPending} onClick={() => handleReject(inv.id)}>
                      <X className="h-3.5 w-3.5" /> Decline
                    </Button>
                    <Button size="sm" className="gap-1" disabled={acceptInvitation.isPending} onClick={() => handleAccept(inv.id)}>
                      <Check className="h-3.5 w-3.5" /> Accept
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your Stores</h2>
        {storesQuery.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : stores.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">You don't belong to any store yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {stores.map((s) => (
              <Card key={s.organizationId} className="card-hover">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{s.role}</p>
                    </div>
                  </div>
                  <Button size="sm" className="gap-1" disabled={setActive.isPending} onClick={() => enterStore(s.organizationId, s.slug)}>
                    Enter <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Link href="/onboarding/create-store">
        <Button variant="outline" className="w-full gap-1.5">
          <Plus className="h-4 w-4" /> Create a new store
        </Button>
      </Link>
    </main>
  );
}
