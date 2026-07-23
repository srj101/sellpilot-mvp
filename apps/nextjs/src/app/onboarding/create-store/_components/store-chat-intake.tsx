"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, Sparkles, Store } from "lucide-react";

import { cn } from "@acme/ui";
import { Avatar, AvatarFallback } from "@acme/ui/avatar";
import { useTRPC } from "~/trpc/react";
import { signOut } from "~/app/[storeSlug]/dashboard/(home)/actions";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  variant?: "question" | "success" | "error";
}

type Step = "name" | "description" | "creating";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <Avatar>
        <AvatarFallback className="bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-4 py-3 w-fit">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

/** AI messages type themselves out; calls onComplete once fully revealed. */
function AiBubble({ message, onComplete }: { message: ChatMessage; onComplete?: () => void }) {
  const [shown, setShown] = useState(onComplete ? "" : message.content);
  const doneRef = useRef(!onComplete);

  useEffect(() => {
    if (doneRef.current) return;
    let i = 0;
    const interval = setInterval(() => {
      i += 2;
      setShown(message.content.slice(0, i));
      if (i >= message.content.length) {
        clearInterval(interval);
        doneRef.current = true;
        onComplete?.();
      }
    }, 12);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-start gap-2">
      <Avatar className="mb-0.5">
        <AvatarFallback className="bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-6",
          message.variant === "error" ? "bg-rose-500/10 text-rose-600" : "bg-muted text-foreground",
        )}
      >
        {shown}
      </div>
    </motion.div>
  );
}

function UserBubble({ message, userName }: { message: ChatMessage; userName: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-end gap-2">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
        {message.content}
      </div>
      <Avatar className="mb-0.5">
        <AvatarFallback>{initials(userName)}</AvatarFallback>
      </Avatar>
    </motion.div>
  );
}

export function StoreChatIntake({ userName }: { userName: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState<Step>("name");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [storeName, setStoreName] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const createStore = useMutation(trpc.org.create.mutationOptions());

  function pushAi(content: string, variant?: ChatMessage["variant"]) {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role: "ai", content, variant }]);
  }
  function pushUser(content: string) {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role: "user", content }]);
  }

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setBusy(true);
    pushAi(`Hey ${userName.split(" ")[0]}! Let's get your store set up on SellPilot — what should we call it?`);
  }, [userName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTyping]);

  function handleAiDone() {
    setBusy(false);
  }

  async function handleSubmit(skip = false) {
    const value = skip ? "" : input.trim();
    if (!skip && !value) return;
    if (busy && step !== "description") return;

    if (step === "name") {
      pushUser(value);
      setInput("");
      setBusy(true);
      setShowTyping(true);

      const { isAvailable } = await queryClient.fetchQuery(trpc.org.verifyName.queryOptions({ name: value }));
      setShowTyping(false);

      if (!isAvailable) {
        pushAi(`"${value}" is already taken by another store — try a different name.`, "error");
        setBusy(false);
        return;
      }

      setStoreName(value);
      pushAi(`Great, "${value}" it is. Want to add a short description? (optional — you can skip this)`, "success");
      setStep("description");
      return;
    }

    if (step === "description") {
      if (skip) {
        pushUser("Skip");
      } else {
        pushUser(value);
      }
      setInput("");
      setBusy(true);
      setShowTyping(true);
      setStep("creating");

      setTimeout(() => {
        setShowTyping(false);
        pushAi("Setting up your store now...");
        createStore.mutate(
          { name: storeName, description: skip ? undefined : value },
          {
            onSuccess: (data) => {
              pushAi(`You're all set! Taking you to ${storeName}'s dashboard...`, "success");
              // Hard navigation (not router.push) — same reasoning as select-store's
              // enterStore: no stale client-cached query data should follow into the new store.
              setTimeout(() => { window.location.href = `/${data.slug}/dashboard`; }, 900);
            },
            onError: (err) => {
              pushAi(err.message || "Something went wrong creating your store — mind trying again?", "error");
              setStep("name");
              setBusy(false);
            },
          },
        );
      }, 500);
    }
  }

  const placeholder = step === "name" ? "e.g. Aurora Goods" : step === "description" ? "A short description of what you sell..." : "";

  return (
    <main className="flex h-screen w-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">SellPilot Setup</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </form>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
          <AnimatePresence initial={false}>
            {messages.map((m, i) =>
              m.role === "ai" ? (
                <AiBubble key={m.id} message={m} onComplete={i === messages.length - 1 ? handleAiDone : undefined} />
              ) : (
                <UserBubble key={m.id} message={m} userName={userName} />
              ),
            )}
          </AnimatePresence>
          {showTyping && <TypingIndicator />}
        </div>
      </div>

      <div className="shrink-0 border-t p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            rows={1}
            disabled={busy || step === "creating"}
            placeholder={placeholder}
            className="min-h-[44px] flex-1 resize-none rounded-full border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          {step === "description" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmit(true)}
              className="h-11 shrink-0 rounded-full border px-4 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            disabled={busy || !input.trim() || step === "creating"}
            onClick={() => void handleSubmit()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  );
}
