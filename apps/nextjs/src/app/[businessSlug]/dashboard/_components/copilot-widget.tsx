"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Send, X, MessageCircle, Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { useBusinessSlug } from "~/hooks/use-business-slug";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS: Record<"basic" | "full", string[]> = {
  basic: ["How many orders did I get this week?", "What are my top selling products?"],
  full: ["Compare Instagram vs Messenger sales this quarter", "How did revenue change last month vs the month before?"],
};

export function CopilotWidget({ tier }: { tier: "none" | "basic" | "full" }) {
  const trpc = useTRPC();
  const businessSlug = useBusinessSlug();
  const askCopilot = useMutation(trpc.analytics.askCopilot.mutationOptions());
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = tier === "none";
  const suggestions = SUGGESTIONS[locked ? "basic" : tier];

  useEffect(() => {
    if (open && !locked && inputRef.current) inputRef.current.focus();
  }, [open, locked]);

  useEffect(() => {
    if (turns.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, askCopilot.isPending]);

  function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || locked || askCopilot.isPending) return;
    const history = turns;
    setTurns([...history, { role: "user", text: trimmed }]);
    setInput("");
    askCopilot.mutate(
      { question: trimmed, history },
      {
        onSuccess: (result) => {
          setTurns((prev) => [...prev, { role: "assistant", text: result.answer }]);
        },
        onError: () => {
          setTurns((prev) => [...prev, { role: "assistant", text: "Sorry, something went wrong. Please try again." }]);
        },
      },
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      {/* Floating Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border bg-background shadow-2xl flex flex-col" style={{ height: "min(520px, 70vh)" }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Co-Pilot</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {locked && (
              <div className="mb-1 flex flex-col items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-center">
                <Lock className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-foreground">
                  Co-Pilot is a Growth feature — upgrade to unlock it for this business
                </p>
                <Link href={`/${businessSlug}/dashboard/pricing`}>
                  <Button size="sm">Upgrade Now</Button>
                </Link>
              </div>
            )}

            {turns.length === 0 && !askCopilot.isPending && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 mb-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">How can I help?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {locked
                    ? "Ask plain-language questions about your sales, in Bangla or English."
                    : "Ask about your sales, orders, or products."}
                </p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={locked}
                      className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  turn.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {turn.text}
              </div>
            ))}

            {askCopilot.isPending && (
              <div className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t px-3 py-3 shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={locked ? "Upgrade to ask about your sales..." : "Ask something..."}
              disabled={locked || askCopilot.isPending}
              className="flex-1 rounded-full border bg-background px-3.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={locked || !input.trim() || askCopilot.isPending}
              className="h-9 w-9 shrink-0 rounded-full"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          open
            ? "bg-foreground text-background scale-95"
            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105",
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </>
  );
}
