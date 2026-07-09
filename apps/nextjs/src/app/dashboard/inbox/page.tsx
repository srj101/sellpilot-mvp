import Link from "next/link";
import { redirect } from "next/navigation";

import { and, desc, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Separator } from "@acme/ui/separator";
import { cn } from "@acme/ui";
import {
  ArrowUpRight,
  Clock3,
  Inbox,
  MessageCircleMore,
  MessageSquareText,
  PanelLeft,
  Send,
  Sparkles,
} from "lucide-react";

import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "../integrations/_components/integration-icons";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { getSession } from "~/auth/server";
import { buildInboxData } from "~/lib/meta-inbox";
import { resolveContactNames } from "~/lib/resolve-contact-names";
import { sendInboxReply } from "./actions";
import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";
import { ScrollToBottom } from "./_components/scroll-to-bottom";

interface InboxSearchParams {
  thread?: string;
  channel?: string;
}

const CHANNELS = [
  { id: "all", label: "All conversations" },
  { id: "facebook_page", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

function formatRelativeTime(date: Date) {
  const diffMs = date.getTime() - Date.now();
  const absSeconds = Math.abs(Math.round(diffMs / 1000));

  if (absSeconds < 60) {
    return "just now";
  }

  const absMinutes = Math.abs(Math.round(diffMs / 60_000));
  if (absMinutes < 60) {
    return `${absMinutes}${diffMs < 0 ? "m ago" : "m"}`;
  }

  const absHours = Math.abs(Math.round(diffMs / 3_600_000));
  if (absHours < 24) {
    return `${absHours}${diffMs < 0 ? "h ago" : "h"}`;
  }

  const absDays = Math.abs(Math.round(diffMs / 86_400_000));
  return `${absDays}${diffMs < 0 ? "d ago" : "d"}`;
}

function formatDetailedTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function channelIcon(platform: string) {
  switch (platform) {
    case "facebook_page":
      return FacebookIcon;
    case "instagram":
      return InstagramIcon;
    case "whatsapp":
      return WhatsAppIcon;
    default:
      return MessageCircleMore;
  }
}

function channelLabel(platform: string) {
  switch (platform) {
    case "facebook_page":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "whatsapp":
      return "WhatsApp";
    default:
      return "Messages";
  }
}

function channelColor(platform: string) {
  switch (platform) {
    case "facebook_page":
      return "text-[#1877F2] bg-[#1877F2]/10 border-[#1877F2]/20";
    case "instagram":
      return "text-pink-600 bg-pink-600/10 border-pink-600/20";
    case "whatsapp":
      return "text-[#25D366] bg-[#25D366]/10 border-[#25D366]/20";
    default:
      return "text-primary bg-primary/10 border-border";
  }
}

function threadAccent(platform: string) {
  switch (platform) {
    case "facebook_page":
      return "from-[#1877F2]/15 to-transparent";
    case "instagram":
      return "from-pink-500/15 to-transparent";
    case "whatsapp":
      return "from-emerald-500/15 to-transparent";
    default:
      return "from-primary/15 to-transparent";
  }
}

function EmptyState() {
  return (
    <div className="bg-card/80 flex min-h-[420px] flex-col items-center justify-center rounded-[28px] border border-dashed p-10 text-center shadow-sm">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">
        No conversations yet
      </h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
        Once Meta sends messages into the webhook, this inbox will populate with
        live conversations, message history, and reply actions.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/dashboard/integrations">Check integrations</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/settings">Review settings</Link>
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({
  direction,
  authorLabel,
  text,
  timestamp,
  imageUrl,
}: {
  direction: "inbound" | "outbound";
  authorLabel: string;
  text: string;
  timestamp: Date;
  imageUrl?: string;
}) {
  const outbound = direction === "outbound";

  return (
    <div
      className={cn(
        "flex max-w-[92%] flex-col gap-1",
        outbound ? "ml-auto items-end" : "mr-auto items-start",
      )}
    >
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.18em]">
        {authorLabel}
      </div>
      <div
        className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm flex flex-col gap-2",
          outbound
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md text-foreground",
        )}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Sent attachment"
            className="max-w-[240px] max-h-[240px] rounded-lg object-contain border bg-background/50 shadow-sm"
          />
        )}
        {text && (text !== "Sent an image" || !imageUrl) && <div>{text}</div>}
      </div>
      <div className="text-muted-foreground text-[11px]">
        {formatDetailedTime(timestamp)}
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  selected,
  channel,
}: {
  thread: {
    id: string;
    platform: string;
    platformLabel: string;
    accountLabel: string;
    contactLabel: string;
    preview: string;
    messageCount: number;
    lastMessageAt: Date;
    messages: { direction: "inbound" | "outbound"; isRead: boolean }[];
  };
  selected: boolean;
  channel: string;
}) {
  const Icon = channelIcon(thread.platform);
  const latestMessage = thread.messages[thread.messages.length - 1];
  const isUnread = latestMessage?.direction === "inbound" && !latestMessage?.isRead;

  return (
    <Link
      href={`/dashboard/inbox?thread=${encodeURIComponent(thread.id)}&channel=${encodeURIComponent(channel)}`}
      className={cn(
        "group flex items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : isUnread
            ? "border-primary/20 bg-primary/2 hover:border-primary/40"
            : "bg-background hover:border-border/80",
      )}
      aria-current={selected ? "page" : undefined}
    >
      <div
        className={cn(
          "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
          channelColor(thread.platform),
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={cn(
              "truncate text-sm font-semibold text-foreground flex items-center gap-1.5",
              isUnread && "font-bold text-foreground"
            )}>
              <span className="truncate">{thread.contactLabel}</span>
              {isUnread && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {thread.accountLabel}
            </div>
          </div>
          <span className={cn(
            "text-muted-foreground shrink-0 text-[11px]",
            isUnread && "font-semibold text-primary"
          )}>
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </div>
        <p className={cn(
          "text-muted-foreground mt-2 line-clamp-2 text-sm leading-6",
          isUnread && "font-medium text-foreground/90"
        )}>
          {thread.preview}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge variant="secondary">{thread.platformLabel}</Badge>
          <span className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
            {thread.messageCount} messages
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function InboxPage(props: {
  searchParams?: Promise<InboxSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const [events, connections] = await Promise.all([
    db
      .select()
      .from(metaWebhookEvent)
      .where(eq(metaWebhookEvent.userId, session.user.id))
      .orderBy(desc(metaWebhookEvent.receivedAt))
      .limit(300),
    db
      .select()
      .from(metaConnection)
      .where(eq(metaConnection.userId, session.user.id))
      .orderBy(desc(metaConnection.connectedAt)),
  ]);

  const resolvedNames = await resolveContactNames(events, connections);
  const data = buildInboxData({ events, connections, resolvedNames });
  const selectedChannel =
    searchParams?.channel &&
      CHANNELS.some((channel) => channel.id === searchParams.channel)
      ? searchParams.channel
      : "all";

  const filteredThreads =
    selectedChannel === "all"
      ? data.threads
      : data.threads.filter((thread) => thread.platform === selectedChannel);

  const selectedThread =
    filteredThreads.find((thread) => thread.id === searchParams?.thread) ??
    filteredThreads[0] ??
    null;

  if (selectedThread) {
    const unreadEventIds = selectedThread.messages
      .filter((m) => m.direction === "inbound" && !m.isRead)
      .map((m) => m.id);

    if (unreadEventIds.length > 0) {
      await db
        .update(metaWebhookEvent)
        .set({ isRead: true })
        .where(inArray(metaWebhookEvent.id, unreadEventIds));

      for (const m of selectedThread.messages) {
        if (unreadEventIds.includes(m.id)) {
          m.isRead = true;
        }
      }

      // Broadcast update to all active SSE subscribers for this user
      void triggerInboxBroadcast(session.user.id);
    }
  }

  const latestEvent = events[0];

  return (
    <DashboardShell>
      <div className="space-y-6 xl:h-[calc(100vh-6rem)] xl:flex xl:flex-col xl:overflow-hidden">
        {/* Responsive Header: clean single flex line on desktop, full decorative card on mobile */}
        <div className="xl:bg-transparent xl:border-0 xl:p-0 xl:shadow-none bg-card/70 relative overflow-hidden rounded-[32px] border p-6 shadow-sm shrink-0">
          <div className="bg-primary/10 absolute inset-x-0 top-0 h-px xl:hidden" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between xl:items-center">
            <div className="max-w-2xl space-y-3 xl:space-y-0 xl:flex xl:items-center xl:gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur xl:py-0.5 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Unified Meta inbox
              </div>
              <div className="xl:flex xl:items-baseline xl:gap-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-2xl xl:font-bold">
                  Inbox
                </h1>
                <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6 sm:text-base xl:hidden">
                  Monitor Facebook, Instagram, and WhatsApp conversations from a
                  single place, reply inline, and keep webhook traffic visible.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Button variant="outline" asChild size="sm">
                <Link href="/dashboard/integrations">
                  Manage channels
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/analytics">
                  View analytics
                  <MessageSquareText className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats grid: only visible on mobile/tablet, hidden on desktop to save height */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:hidden">
            <div className="bg-background/80 rounded-2xl border p-4 shadow-sm">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Conversations
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-3xl font-semibold tracking-tight">
                  {data.stats.threadCount}
                </div>
                <PanelLeft className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div className="bg-background/80 rounded-2xl border p-4 shadow-sm">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Messages
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-3xl font-semibold tracking-tight">
                  {data.stats.messageCount}
                </div>
                <MessageCircleMore className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div className="bg-background/80 rounded-2xl border p-4 shadow-sm">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Connected channels
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-3xl font-semibold tracking-tight">
                  {connections.length}
                </div>
                <Inbox className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div className="bg-background/80 rounded-2xl border p-4 shadow-sm">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Last webhook
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-lg font-semibold tracking-tight">
                  {latestEvent ? formatRelativeTime(latestEvent.receivedAt) : "Idle"}
                </div>
                <Clock3 className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_300px] xl:flex-1 xl:min-h-0">
          <section className="space-y-4 xl:h-full xl:flex xl:flex-col xl:overflow-hidden">
            <div className="bg-card rounded-[28px] border p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Conversations
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Select a thread to review the live message history.
                  </p>
                </div>
                <Badge variant="secondary">{filteredThreads.length}</Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {CHANNELS.map((channel) => {
                  const active = selectedChannel === channel.id;

                  return (
                    <Button
                      key={channel.id}
                      asChild
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className="rounded-full"
                    >
                      <Link href={`/dashboard/inbox?channel=${channel.id}`}>
                        {channel.label}
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 xl:flex-1 xl:overflow-y-auto xl:pr-1">
              {filteredThreads.length > 0 ? (
                filteredThreads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    selected={thread.id === selectedThread?.id}
                    channel={selectedChannel}
                  />
                ))
              ) : (
                <EmptyState />
              )}
            </div>
          </section>

          <section className="bg-card flex min-h-[500px] xl:h-full flex-col rounded-[28px] border shadow-sm xl:overflow-hidden">
            {selectedThread ? (
              <>
                <div className="relative overflow-hidden rounded-t-[28px] border-b px-6 py-5">
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-r",
                      threadAccent(selectedThread.platform),
                    )}
                  />
                  <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{selectedThread.platformLabel}</Badge>
                        <Badge variant="secondary">
                          {selectedThread.accountLabel}
                        </Badge>
                        <Badge variant="outline">Live thread</Badge>
                      </div>
                      <div>
                        <h2 className="text-2xl font-semibold tracking-tight">
                          {selectedThread.contactLabel}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                          Thread ID {selectedThread.id}
                        </p>
                      </div>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-background shadow-sm">
                        {(() => {
                          const Icon = channelIcon(selectedThread.platform);
                          return <Icon className="h-5 w-5" />;
                        })()}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {selectedThread.messageCount} messages
                        </div>
                        <div>{formatRelativeTime(selectedThread.lastMessageAt)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden p-6 xl:flex xl:flex-col xl:min-h-0">
                  <div className="border-border/60 bg-background/70 flex h-full flex-col rounded-[24px] border xl:flex-1 xl:min-h-0">
                    <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                      {selectedThread.messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          direction={message.direction}
                          authorLabel={message.authorLabel}
                          text={message.text}
                          timestamp={message.timestamp}
                          imageUrl={message.imageUrl}
                        />
                      ))}
                      <ScrollToBottom />
                    </div>

                    <Separator />

                    <div className="p-4 sm:p-6">
                      <form action={sendInboxReply} className="space-y-3">
                        <input
                          type="hidden"
                          name="threadId"
                          value={selectedThread.id}
                        />
                        <input
                          type="hidden"
                          name="platform"
                          value={selectedThread.platform}
                        />
                        <input
                          type="hidden"
                          name="accountId"
                          value={selectedThread.accountId}
                        />
                        <input
                          type="hidden"
                          name="recipientId"
                          value={selectedThread.replyTargetId}
                        />
                        <input
                          type="hidden"
                          name="channel"
                          value={selectedChannel}
                        />
                        <div className="rounded-2xl border bg-background shadow-sm">
                          <textarea
                            name="message"
                            rows={4}
                            placeholder="Write a reply..."
                            className="placeholder:text-muted-foreground min-h-[124px] w-full resize-none rounded-2xl border-0 bg-transparent px-4 py-3 text-sm outline-none focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-muted-foreground text-xs">
                            Reply will be sent through {selectedThread.platformLabel}.
                          </p>
                          <Button type="submit">
                            <Send className="mr-2 h-4 w-4" />
                            Send reply
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[680px] items-center justify-center p-8">
                <EmptyState />
              </div>
            )}
          </section>

          <aside className="space-y-4 xl:h-full xl:overflow-y-auto xl:pr-1">
            {/* Desktop Overview Stats Card */}
            <div className="hidden xl:block bg-card rounded-[28px] border p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/75 mb-3">
                Overview
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background rounded-2xl border p-3">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Threads</div>
                  <div className="text-xl font-bold mt-1 tabular-nums">{data.stats.threadCount}</div>
                </div>
                <div className="bg-background rounded-2xl border p-3">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Messages</div>
                  <div className="text-xl font-bold mt-1 tabular-nums">{data.stats.messageCount}</div>
                </div>
                <div className="bg-background rounded-2xl border p-3">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Channels</div>
                  <div className="text-xl font-bold mt-1 tabular-nums">{connections.length}</div>
                </div>
                <div className="bg-background rounded-2xl border p-3">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Webhook</div>
                  <div className="text-[11px] font-semibold mt-2 truncate">
                    {latestEvent ? formatRelativeTime(latestEvent.receivedAt) : "Idle"}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-[28px] border p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">
                    Channel health
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Live connection and subscription status.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {connections.map((connection) => {
                  const Icon = channelIcon(connection.platform);

                  return (
                    <div
                      key={connection.id}
                      className="bg-background flex items-center gap-3 rounded-2xl border p-3"
                    >
                      <div
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl border",
                          channelColor(connection.platform),
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {connection.platformAccountName ??
                            connection.facebookPageName ??
                            connection.instagramUsername ??
                            connection.whatsappPhoneNumberId ??
                            connection.platformAccountId}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {channelLabel(connection.platform)} ·{" "}
                          {connection.webhookSubscriptionStatus}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {connections.length === 0 ? (
                  <p className="text-muted-foreground rounded-2xl border border-dashed p-4 text-sm leading-6">
                    Connect a Meta channel in Integrations to start receiving
                    messages here.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="bg-card rounded-[28px] border p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">
                    Recent activity
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Comment, read, and delivery events from the webhook stream.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {data.activity.length > 0 ? (
                  data.activity.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{item.title}</div>
                        <span className="text-muted-foreground text-[11px]">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        {item.detail}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground rounded-2xl border border-dashed p-4 text-sm leading-6">
                    No secondary webhook activity has arrived yet.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
