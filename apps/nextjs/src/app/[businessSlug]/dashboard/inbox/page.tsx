import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@acme/ui/button";
import { Separator } from "@acme/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetTrigger } from "@acme/ui/sheet";
import { cn } from "@acme/ui";
import { Inbox, Info, MessageSquareText } from "lucide-react";

import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { getSession } from "~/auth/server";
import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";
import { createCaller } from "~/trpc/caller";
import { ScrollToBottom } from "./_components/scroll-to-bottom";
import { ConversationList } from "./_components/conversation-list";
import { ReplyForm } from "./_components/reply-form";
import { ThreadHeaderActions } from "./_components/thread-header-actions";
import { ContactPanel } from "./_components/contact-panel";
import { InboxTabsBar } from "./_components/inbox-tabs-bar";
import { HighTrafficBanner } from "./_components/high-traffic-banner";
import { MobileConversationSheet } from "./_components/mobile-conversation-sheet";
import {
  avatarColor,
  channelIcon,
  formatDetailedTime,
  formatRelativeTimeLong,
  initials,
} from "./_components/inbox-utils";

interface InboxSearchParams {
  thread?: string;
}

function EmptyState({ businessSlug, hasThreads }: { businessSlug: string; hasThreads: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      {hasThreads ? (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Select a conversation</h2>
          <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
            Choose a conversation from the list to view messages and reply.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold tracking-tight">No conversations yet</h2>
          <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
            Once Meta sends messages into the webhook, this inbox will populate with live
            conversations, message history, and reply actions.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href={`/${businessSlug}/dashboard/integrations`}>Check integrations</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function MessageBubble({
  direction,
  text,
  timestamp,
  imageUrl,
  sentBy,
}: {
  direction: "inbound" | "outbound";
  text: string;
  timestamp: Date;
  imageUrl?: string;
  sentBy?: string;
}) {
  const outbound = direction === "outbound";

  return (
    <div className={cn("flex max-w-[75%] flex-col gap-1", outbound ? "ml-auto items-end" : "mr-auto items-start")}>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
          outbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Sent attachment"
            className="max-h-[240px] max-w-[240px] rounded-lg border bg-background/50 object-contain shadow-sm"
          />
        )}
        {text && (text !== "Sent an image" || !imageUrl) && <div>{text}</div>}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {formatDetailedTime(timestamp)}
        {outbound && sentBy && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              sentBy === "ai" ? "bg-violet-500/10 text-violet-500" : "bg-blue-500/10 text-blue-500",
            )}
          >
            {sentBy === "ai" ? "Replied by AI" : "Replied by You"}
          </span>
        )}
      </div>
    </div>
  );
}

export default async function InboxPage(props: {
  searchParams?: Promise<InboxSearchParams>;
  params: Promise<{ businessSlug: string }>;
}) {
  const searchParams = await props.searchParams;
  const { businessSlug } = await props.params;
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const data = await caller.inbox.getInboxData({ threadId: searchParams?.thread });

  if (data.markedRead) {
    void triggerInboxBroadcast(session.user.id);
  }

  const selectedThread = data.selectedThread;

  return (
    <DashboardShell>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm">
      <div className="hidden md:block">
        <InboxTabsBar threads={data.threads} />
      </div>
      <HighTrafficBanner />

        <div
          className={cn(
            "grid h-full w-full min-h-0 grid-cols-1 overflow-hidden",
            selectedThread ? "md:grid-cols-[320px_1fr_320px]" : "md:grid-cols-[320px_1fr]",
          )}
        >
          {/* Left: Conversation list — desktop only */}
          <div className="hidden min-h-0 overflow-y-auto border-r md:block">
            <ConversationList threads={data.threads} selectedThreadId={selectedThread?.id ?? null} />
          </div>

          {/* Center: Messages */}
          <div className="min-h-0 flex flex-col">
            {selectedThread ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3 md:gap-3 md:px-5 md:py-4">
                  {/* Conversation list — mobile only */}
                  <MobileConversationSheet
                    threads={data.threads}
                    selectedThreadId={selectedThread?.id ?? null}
                  />
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white md:h-9 md:w-9",
                      avatarColor(selectedThread.contactLabel),
                    )}
                  >
                    {initials(selectedThread.contactLabel)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{selectedThread.contactLabel}</p>
                    <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground md:text-xs">
                      {channelIcon(selectedThread.platform, "h-3 w-3")}
                      {selectedThread.accountLabel}
                    </p>
                  </div>
                  {/* Contact info — mobile only, opens sheet */}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 md:hidden" aria-label="Contact info">
                        <Info className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[85vw] p-0 sm:w-[380px]" hideClose>
                      <ContactPanel
                        threadId={selectedThread.id}
                        customerId={selectedThread.customerId}
                        contactLabel={selectedThread.contactLabel}
                        messages={selectedThread.messages}
                        initialSummary={selectedThread.summary}
                      />
                      <SheetFooter className="border-t p-4">
                        <SheetClose asChild>
                          <Button variant="outline" className="w-full">Close</Button>
                        </SheetClose>
                      </SheetFooter>
                    </SheetContent>
                  </Sheet>
                  <ThreadHeaderActions
                    threadId={selectedThread.id}
                    status={selectedThread.status}
                    starred={selectedThread.starred}
                    handlingMode={selectedThread.handlingMode}
                  />
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
                  {selectedThread.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      direction={message.direction}
                      text={message.text}
                      timestamp={message.timestamp}
                      imageUrl={message.imageUrl}
                      sentBy={message.sentBy}
                    />
                  ))}
                  <ScrollToBottom />
                </div>

                <Separator />

                <div className="shrink-0 p-3 md:p-4">
                  <ReplyForm
                    threadId={selectedThread.id}
                    platform={selectedThread.platform}
                    accountId={selectedThread.accountId}
                    recipientId={selectedThread.replyTargetId}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Mobile: select conversation button */}
                <div className="flex h-full flex-col items-center justify-center p-10 text-center md:hidden">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">Your Inbox</h2>
                  <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
                    Select a conversation to view messages and reply.
                  </p>
                  <div className="mt-6">
                    <MobileConversationSheet
                      threads={data.threads}
                      selectedThreadId={null}
                      showLabel
                    />
                  </div>
                </div>
                {/* Desktop: empty state */}
                <EmptyState businessSlug={businessSlug} hasThreads={data.threads.length > 0} />
              </>
            )}
          </div>

          {/* Right: Contact panel — desktop only */}
          {selectedThread && (
            <div className="hidden min-h-0 overflow-y-auto border-l md:block">
              <ContactPanel
                key={selectedThread.id}
                threadId={selectedThread.id}
                customerId={selectedThread.customerId}
                contactLabel={selectedThread.contactLabel}
                messages={selectedThread.messages}
                initialSummary={selectedThread.summary}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
