import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@acme/ui/button";
import { Separator } from "@acme/ui/separator";
import { cn } from "@acme/ui";
import { Inbox } from "lucide-react";

import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { getSession } from "~/auth/server";
import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";
import { createCaller } from "~/trpc/caller";
import { ScrollToBottom } from "./_components/scroll-to-bottom";
import { ConversationList } from "./_components/conversation-list";
import { ReplyForm } from "./_components/reply-form";
import { ThreadHeaderActions } from "./_components/thread-header-actions";
import { ContactPanel } from "./_components/contact-panel";
import {
  avatarColor,
  channelIcon,
  channelLabel,
  formatDetailedTime,
  formatRelativeTimeLong,
  initials,
} from "./_components/inbox-utils";

interface InboxSearchParams {
  thread?: string;
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No conversations yet</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
        Once Meta sends messages into the webhook, this inbox will populate with live
        conversations, message history, and reply actions.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/dashboard/integrations">Check integrations</Link>
        </Button>
      </div>
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

export default async function InboxPage(props: { searchParams?: Promise<InboxSearchParams> }) {
  const searchParams = await props.searchParams;
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
      <div className="flex h-full w-full flex-col">
        <div
          className={cn(
            "grid w-full min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-2xl border bg-card",
            selectedThread ? "md:grid-cols-[320px_1fr_320px]" : "md:grid-cols-[320px_1fr]",
          )}
        >
          <div className="min-h-0 border-b md:border-b-0 md:border-r">
            <ConversationList threads={data.threads} selectedThreadId={selectedThread?.id ?? null} />
          </div>

          <div className="flex min-h-0 flex-col">
            {selectedThread ? (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white",
                      avatarColor(selectedThread.contactLabel),
                    )}
                  >
                    {initials(selectedThread.contactLabel)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{selectedThread.contactLabel}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {channelIcon(selectedThread.platform, "h-3 w-3")}
                      {channelLabel(selectedThread.platform)} · Active {formatRelativeTimeLong(selectedThread.lastMessageAt)}
                    </p>
                  </div>
                  <ThreadHeaderActions threadId={selectedThread.id} status={selectedThread.status} starred={selectedThread.starred} />
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-6">
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

                <div className="shrink-0 p-4">
                  <ReplyForm
                    threadId={selectedThread.id}
                    platform={selectedThread.platform}
                    accountId={selectedThread.accountId}
                    recipientId={selectedThread.replyTargetId}
                  />
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </div>

          {selectedThread && (
            <div className="hidden min-h-0 border-l md:block">
              <ContactPanel
                threadId={selectedThread.id}
                customerId={selectedThread.customerId}
                contactLabel={selectedThread.contactLabel}
                messages={selectedThread.messages}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
