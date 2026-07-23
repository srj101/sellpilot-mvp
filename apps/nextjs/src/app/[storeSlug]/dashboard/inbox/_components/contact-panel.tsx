"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, Plus, Sparkles, Tag as TagIcon, X } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@acme/ui/collapsible";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import type { InboxMessage } from "@acme/api/meta-inbox";
import { CreateOrderSheet } from "./create-order-sheet";
import { formatCurrency, TAG_COLOR_CLASSES } from "./inbox-utils";
import { useStoreSlug } from "~/hooks/use-store-slug";

function Section({
  title,
  action,
  badge,
  collapsible,
  defaultOpen = true,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const header = (
    <div className="flex items-center justify-between">
      {collapsible ? (
        <CollapsibleTrigger asChild>
          <button type="button" className="flex items-center gap-1.5 text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            {badge}
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
      ) : (
        <span className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
          {badge}
        </span>
      )}
      {action}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="border-b px-4 py-4 last:border-0">
        {header}
        <div className="mt-2">{children}</div>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b px-4 py-4 last:border-0">
      {header}
      <CollapsibleContent className="mt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function ContactPanel({
  threadId,
  customerId,
  contactLabel,
  messages,
}: {
  threadId: string;
  customerId: string | null;
  contactLabel: string;
  messages: InboxMessage[];
}) {
  const trpc = useTRPC();
  const storeSlug = useStoreSlug();
  const [noteText, setNoteText] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");

  const contact = useQuery({
    ...trpc.inbox.getContactDetails.queryOptions({ customerId: customerId ?? "" }),
    enabled: Boolean(customerId),
  });
  const notes = useQuery({
    ...trpc.inbox.listNotes.queryOptions({ customerId: customerId ?? "" }),
    enabled: Boolean(customerId),
  });
  const allTags = useQuery({ ...trpc.inbox.listTags.queryOptions(), enabled: addingTag });

  const addNote = useMutation(trpc.inbox.addNote.mutationOptions({ onSuccess: () => notes.refetch() }));
  const createTag = useMutation(trpc.inbox.createTag.mutationOptions());
  const tagCustomer = useMutation(trpc.inbox.tagCustomer.mutationOptions({ onSuccess: () => contact.refetch() }));
  const untagCustomer = useMutation(trpc.inbox.untagCustomer.mutationOptions({ onSuccess: () => contact.refetch() }));
  const generateSummary = useMutation(trpc.inbox.generateSummary.mutationOptions());

  const sharedFiles = useMemo(
    () => messages.filter((m): m is InboxMessage & { imageUrl: string } => Boolean(m.imageUrl)),
    [messages],
  );

  const [summary, setSummary] = useState<string | null>(null);

  function handleAddNote() {
    if (!customerId || !noteText.trim()) return;
    addNote.mutate(
      { customerId, body: noteText.trim() },
      { onSuccess: () => setNoteText("") },
    );
  }

  function handleAddExistingTag(tagId: string) {
    if (!customerId) return;
    tagCustomer.mutate({ customerId, tagId });
    setAddingTag(false);
  }

  async function handleCreateAndAddTag() {
    if (!customerId || !newTagLabel.trim()) return;
    const created = await createTag.mutateAsync({ label: newTagLabel.trim() });
    if (created) tagCustomer.mutate({ customerId, tagId: created.id });
    setNewTagLabel("");
    setAddingTag(false);
  }

  function handleGenerateSummary() {
    generateSummary.mutate(
      {
        threadId,
        messages: messages
          .slice()
          .reverse()
          .map((m) => ({ role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const), text: m.text })),
      },
      { onSuccess: (r) => setSummary(r.summary), onError: (e) => toast.error(e.message) },
    );
  }

  const cust = contact.data?.customer;
  const usedTagIds = new Set((contact.data?.tags ?? []).map((t) => t.id));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section
        title="Order Actions"
        action={
          <Link href={customerId ? `/${storeSlug}/dashboard/orders?customerId=${customerId}` : `/${storeSlug}/dashboard/orders`}>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
              Manage Orders <ArrowUpRight className="h-3 w-3" />
            </Button>
          </Link>
        }
      >
        <CreateOrderSheet
          threadId={threadId}
          defaultName={cust?.name ?? contactLabel}
          defaultPhone={cust?.phone ?? undefined}
          defaultAddress={cust?.address ?? undefined}
          defaultDistrict={cust?.district ?? undefined}
        />
      </Section>

      <Section title="Contact Details" collapsible>
        {!customerId ? (
          <p className="text-xs text-muted-foreground">No customer record linked yet — one is created automatically the first time an order is placed on this conversation.</p>
        ) : cust ? (
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{cust.name}</dd></div>
            {cust.phone && <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd>{cust.phone}</dd></div>}
            {cust.email && <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{cust.email}</dd></div>}
            {cust.address && <div className="flex justify-between gap-4"><dt className="shrink-0 text-muted-foreground">Address</dt><dd className="text-right">{cust.address}</dd></div>}
            {cust.district && <div className="flex justify-between"><dt className="text-muted-foreground">District</dt><dd>{cust.district}</dd></div>}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}
      </Section>

      <Section
        title="Tags"
        action={
          customerId && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddingTag((v) => !v)}>
              <Plus className="h-3 w-3" /> Add New
            </Button>
          )
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {(contact.data?.tags ?? []).map((t) => (
            <span
              key={t.id}
              className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", TAG_COLOR_CLASSES[t.color] ?? TAG_COLOR_CLASSES.slate)}
            >
              <TagIcon className="h-2.5 w-2.5" />
              {t.label}
              <button type="button" onClick={() => customerId && untagCustomer.mutate({ customerId, tagId: t.id })} aria-label={`Remove ${t.label}`}>
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {(!contact.data?.tags || contact.data.tags.length === 0) && !addingTag && (
            <p className="text-xs text-muted-foreground">No tags yet.</p>
          )}
        </div>

        {addingTag && (
          <div className="mt-2 space-y-2 rounded-lg border p-2">
            <div className="flex flex-wrap gap-1.5">
              {(allTags.data ?? []).filter((t) => !usedTagIds.has(t.id)).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleAddExistingTag(t.id)}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", TAG_COLOR_CLASSES[t.color] ?? TAG_COLOR_CLASSES.slate)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={newTagLabel}
                onChange={(e) => setNewTagLabel(e.target.value)}
                placeholder="New tag name..."
                className="h-7 flex-1 rounded-md border bg-background px-2 text-xs"
              />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreateAndAddTag} disabled={!newTagLabel.trim()}>
                Add
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Notes for the customer"
        collapsible
        defaultOpen={false}
        badge={
          <span className="rounded-md bg-primary/10 px-1.5 py-0 text-[10px] font-bold text-primary">{notes.data?.length ?? 0}</span>
        }
      >
        {customerId ? (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              />
              <Button size="sm" className="h-8 px-2 text-xs" onClick={handleAddNote} disabled={!noteText.trim() || addNote.isPending}>
                Add
              </Button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {(notes.data ?? []).map((n) => (
                <div key={n.id} className="rounded-lg bg-muted/50 p-2 text-xs">
                  <p className="text-foreground">{n.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{n.authorLabel} · {new Date(n.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Notes are available once this conversation is linked to a customer.</p>
        )}
      </Section>

      <Section
        title="Conversation Summary"
        collapsible
        defaultOpen={false}
        action={
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleGenerateSummary} disabled={generateSummary.isPending}>
            <Sparkles className="h-3 w-3" /> {generateSummary.isPending ? "Generating..." : "Regenerate"}
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">{summary ?? "No summary generated yet."}</p>
      </Section>

      <Section title="Shared Files">
        {sharedFiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">No images shared in this conversation yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sharedFiles.map((m) => (
              <a key={m.id} href={m.imageUrl} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border">
                <img src={m.imageUrl} alt="Shared attachment" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </Section>

      {(contact.data?.recentOrders?.length ?? 0) > 0 && (
        <Section title="Recent Orders">
          <div className="space-y-2">
            {contact.data!.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                <span className="capitalize">{o.status}</span>
                <span className="font-semibold">{formatCurrency(o.total)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
