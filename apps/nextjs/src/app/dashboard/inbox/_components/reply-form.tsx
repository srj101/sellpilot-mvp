"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";

import { useTRPC } from "~/trpc/react";

export function ReplyForm({
  threadId,
  platform,
  accountId,
  recipientId,
}: {
  threadId: string;
  platform: "facebook_page" | "instagram" | "whatsapp";
  accountId: string;
  recipientId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const sendReply = useMutation(trpc.inbox.sendReply.mutationOptions());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    sendReply.mutate(
      { threadId, platform, accountId, recipientId, message: trimmed },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setMessage("");
            router.refresh();
          }
        },
      },
    );
  }

  return (
    <div className="space-y-1.5">
      {sendReply.data && !sendReply.data.ok && (
        <p className="px-1 text-xs text-rose-600">{sendReply.data.reason}</p>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={1}
          placeholder="Type a message..."
          className="min-h-[42px] flex-1 resize-none rounded-full border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={sendReply.isPending || !message.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
