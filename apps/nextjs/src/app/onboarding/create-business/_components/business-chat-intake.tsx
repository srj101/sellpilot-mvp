"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { z } from "zod/v4";

import { cn } from "@acme/ui";
import { Avatar, AvatarFallback } from "@acme/ui/avatar";
import { useTRPC } from "~/trpc/react";
import { INDUSTRY_TAXONOMY } from "./industry-taxonomy";
import { CURRENCY_OPTIONS } from "./currency-options";
import type { CurrencyCode } from "./currency-options";
import { OnboardingShell } from "./onboarding-shell";

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

type Step = "name" | "industry" | "currency" | "address" | "delivery" | "creating";

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

const CHIP_CLASS =
  "rounded-full border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors";

/**
 * Validates each chat step's free-text answer before it's accepted — replaces silently
 * coercing bad input (e.g. a non-numeric delivery charge used to just become `0`) with a
 * real error surfaced back to the user in the same chat-bubble error style as the
 * business-name-taken check.
 */
const StoreNameInputSchema = z
  .string()
  .trim()
  .min(2, "Business name needs to be at least 2 characters.")
  .max(120, "That name's a bit long — try something under 120 characters.");

const AddressInputSchema = z
  .string()
  .trim()
  .max(300, "That address is a bit long — try something under 300 characters.");

const ShippingCostInputSchema = z.coerce
  .number({ error: "Enter a number, e.g. 60." })
  .min(0, "Delivery charge can't be negative.")
  .max(100_000, "That seems too high — enter a smaller amount.");

export function BusinessChatIntake({
  userName,
  onComplete,
}: {
  userName: string;
  onComplete?: (slug: string, trialEndsAt?: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState<Step>("name");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryGroup, setIndustryGroup] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("BDT");
  const [address, setAddress] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const createBusiness = useMutation(trpc.business.create.mutationOptions());

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
    pushAi(`Welcome to SellPilot, ${userName.split(" ")[0]}! What's the name of your business?`);
  }, [userName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTyping]);

  function handleAiDone() {
    setBusy(false);
  }

  function chooseIndustry(label: string) {
    pushUser(label || "Skip");
    setBusy(true);
    setShowTyping(true);
    setIndustry(label);
    setIndustryGroup(null);

    setTimeout(() => {
      setShowTyping(false);
      pushAi("Got it. What currency do you price in?");
      setStep("currency");
    }, 500);
  }

  function chooseCurrency(code: CurrencyCode) {
    pushUser(code);
    setBusy(true);
    setShowTyping(true);
    setCurrency(code);

    setTimeout(() => {
      setShowTyping(false);
      pushAi("Got it. Where is your business located? (Full address)");
      setStep("address");
    }, 500);
  }

  async function handleSubmit(skip = false) {
    const value = skip ? "" : input.trim();
    if (!skip && !value) return;
    if (busy && step !== "address" && step !== "delivery") return;

    if (step === "name") {
      const parsed = StoreNameInputSchema.safeParse(value);
      if (!parsed.success) {
        pushUser(value);
        setInput("");
        pushAi(parsed.error.issues[0]?.message ?? "That doesn't look right — try again.", "error");
        return;
      }

      pushUser(parsed.data);
      setInput("");
      setBusy(true);
      setShowTyping(true);

      const { isAvailable } = await queryClient.fetchQuery(trpc.business.verifyName.queryOptions({ name: parsed.data }));
      setShowTyping(false);

      if (!isAvailable) {
        pushAi(`"${parsed.data}" is already taken by another store — try a different name.`, "error");
        setBusy(false);
        return;
      }

      setStoreName(parsed.data);
      pushAi(`Nice! Which industry is ${parsed.data} in? Pick a category below.`, "success");
      setStep("industry");
      return;
    }

    if (step === "address") {
      const parsed = skip ? { success: true as const, data: "" } : AddressInputSchema.safeParse(value);
      if (!parsed.success) {
        pushUser(value);
        setInput("");
        pushAi(parsed.error.issues[0]?.message ?? "That doesn't look right — try again.", "error");
        return;
      }

      pushUser(skip ? "Skip" : parsed.data);
      setInput("");
      setBusy(true);
      setShowTyping(true);
      setAddress(parsed.data);

      setTimeout(() => {
        setShowTyping(false);
        pushAi(
          currency === "BDT"
            ? `Lastly, how much do you typically charge for delivery inside Dhaka? (Enter amount in ${currency})`
            : `Lastly, how much do you typically charge for a standard local delivery? (Enter amount in ${currency})`,
        );
        setStep("delivery");
      }, 500);
      return;
    }

    if (step === "delivery") {
      const parsed = skip ? { success: true as const, data: 0 } : ShippingCostInputSchema.safeParse(value);
      if (!parsed.success) {
        pushUser(value);
        setInput("");
        pushAi(parsed.error.issues[0]?.message ?? "Enter a valid number.", "error");
        return;
      }

      pushUser(skip ? "Skip" : value);
      setInput("");
      setBusy(true);
      setShowTyping(true);
      setStep("creating");

      const shippingCost = parsed.data;

      setTimeout(() => {
        setShowTyping(false);
        pushAi("Setting up your business now...");
        createBusiness.mutate(
          { name: storeName, industry, address, defaultShippingCost: shippingCost, currency },
          {
            onSuccess: (data) => {
              pushAi(`You're all set! Taking you to the next step...`, "success");
              setTimeout(() => {
                if (onComplete) onComplete(data.slug, data.trialEndsAt);
              }, 900);
            },
            onError: (err) => {
              pushAi(err.message || "Something went wrong creating your business — mind trying again?", "error");
              setStep("delivery");
              setBusy(false);
            },
          },
        );
      }, 500);
    }
  }

  const placeholder =
    step === "name" ? "e.g. Aurora Goods"
      : step === "address" ? (currency === "BDT" ? "e.g. 123 Main St, Dhaka" : "e.g. 123 Main St, City")
        : step === "delivery" ? "e.g. 60"
          : "";

  const activeGroup = INDUSTRY_TAXONOMY.find((g) => g.group === industryGroup);

  return (
    <OnboardingShell
      current="chat"
      title="Let's set up your business"
      description="A few quick questions and you'll be ready to sell."
      bodyClassName="flex h-[75vh] flex-col"
    >
      <div ref={scrollRef} className="scrollbar-thin -mx-1 flex-1 space-y-4 overflow-y-auto px-1">
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

      <div className="shrink-0 border-t pt-4">
        <div>
          {step === "industry" ? (
            <AnimatePresence mode="wait">
              {industryGroup === null ? (
                <motion.div
                  key="groups"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-2"
                >
                  {INDUSTRY_TAXONOMY.map((g) => (
                    <button
                      key={g.group}
                      type="button"
                      disabled={busy}
                      onClick={() => setIndustryGroup(g.group)}
                      className={CHIP_CLASS}
                    >
                      {g.group}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => chooseIndustry("")}
                    className={cn(CHIP_CLASS, "text-muted-foreground")}
                  >
                    Skip
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="leaves"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setIndustryGroup(null)}
                    className={cn(CHIP_CLASS, "text-muted-foreground")}
                  >
                    ← Back
                  </button>
                  {activeGroup?.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={busy}
                      onClick={() => chooseIndustry(opt)}
                      className={CHIP_CLASS}
                    >
                      {opt}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          ) : step === "currency" ? (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2">
              {CURRENCY_OPTIONS.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseCurrency(c.code)}
                  className={CHIP_CLASS}
                >
                  {c.label}
                </button>
              ))}
            </motion.div>
          ) : (
            <div className="flex items-end gap-2">
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
              {step !== "name" && step !== "creating" && (
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
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}
