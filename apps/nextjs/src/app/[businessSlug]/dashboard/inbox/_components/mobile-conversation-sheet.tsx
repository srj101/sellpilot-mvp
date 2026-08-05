"use client";

import { MessageSquareText } from "lucide-react";

import type { InboxThread } from "@acme/api/meta-inbox";
import { Button } from "@acme/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetClose, SheetTrigger } from "@acme/ui/sheet";

import { ConversationList } from "./conversation-list";

export function MobileConversationSheet({
  threads,
  selectedThreadId,
  showLabel = false,
}: {
  threads: InboxThread[];
  selectedThreadId: string | null;
  showLabel?: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {showLabel ? (
          <Button type="button" variant="default" className="gap-2">
            <MessageSquareText className="h-4 w-4" />
            Select Conversation
          </Button>
        ) : (
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 md:hidden" aria-label="Conversations">
            <MessageSquareText className="h-4 w-4" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] p-0 sm:w-[320px]" hideClose>
        <ConversationList threads={threads} selectedThreadId={selectedThreadId} />
        <SheetFooter className="border-t p-4">
          <SheetClose asChild>
            <Button variant="outline" className="w-full">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
