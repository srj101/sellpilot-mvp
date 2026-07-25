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
import { CURRENCY_OPTIONS, type CurrencyCode } from "./currency-options";
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
 * Persisted across remounts (React Fast Refresh during dev, an accidental tab
 * reload, etc.) — without this, any remount wipes the whole conversation back
 * to "what's your business name?" since it previously lived in plain useState.
 * sessionStorage (not localStorage) so it doesn't outlive the tab/session.
 */
const STORAGE_KEY = "sellpilot:onboarding-chat";

const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["ai", "user"]),
  content: z.string(),
  variant: z.enum(["question", "success", "error"]).optional(),
});

const StepSchema = z.enum(["name", "industry", "currency", "address", "delivery", "creating"]);

const CurrencyCodeSchema = z.enum(CURRENCY_OPTIONS.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]]);

const PersistedChatStateSchema = z.object({
  messages: z.array(ChatMessageSchema),
  step: StepSchema,
  storeName: z.string(),
  industry: z.string(),
  currency: CurrencyCodeSchema,
  address: z.string(),
});

type PersistedChatState = z.infer<typeof PersistedChatStateSchema>;

/** Validates the stored JSON against the schema above rather than blindly trusting an `as` cast — a stale
 * shape left over from a previous version of this schema (or hand-edited storage) is discarded, not crashed on. */
function loadPersisted(): PersistedChatState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = PersistedChatStateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function clearPersisted() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function BusinessChatIntake({
  userName,
  onComplete,
}: {
  userName: string;
  onComplete?: (slug: string, trialEndsAt?: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [restored] = useState(() => loadPersisted());

  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? []);
  // "creating" is a transient in-flight state — if a remount catches it mid-submit,
  // fall back to "delivery" so the user can just press submit again.
  const [step, setStep] = useState<Step>(
    restored?.step === "creating" ? "delivery" : (restored?.step ?? "name"),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [storeName, setStoreName] = useState(restored?.storeName ?? "");
  const [industry, setIndustry] = useState(restored?.industry ?? "");
  const [industryGroup, setIndustryGroup] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>(restored?.currency ?? "BDT");
  const [address, setAddress] = useState(restored?.address ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(!!restored);

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

  // Persist on every change so a remount picks up exactly where the user left off.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (messages.length === 0) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages, step, storeName, industry, currency, address } satisfies PersistedChatState),
    );
  }, [messages, step, storeName, industry, currency, address]);

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
      pushUser(value);
      setInput("");
      setBusy(true);
      setShowTyping(true);

      const { isAvailable } = await queryClient.fetchQuery(trpc.business.verifyName.queryOptions({ name: value }));
      setShowTyping(false);

      if (!isAvailable) {
        pushAi(`"${value}" is already taken by another store — try a different name.`, "error");
        setBusy(false);
        return;
      }

      setStoreName(value);
      pushAi(`Nice! Which industry is ${value} in? Pick a category below.`, "success");
      setStep("industry");
      return;
    }

    if (step === "address") {
      pushUser(skip ? "Skip" : value);
      setInput("");
      setBusy(true);
      setShowTyping(true);
      setAddress(skip ? "" : value);

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
      pushUser(skip ? "Skip" : value);
      setInput("");
      setBusy(true);
      setShowTyping(true);
      setStep("creating");

      const shippingCost = skip || isNaN(parseInt(value)) ? 0 : parseInt(value);

      setTimeout(() => {
        setShowTyping(false);
        pushAi("Setting up your business now...");
        createBusiness.mutate(
          { name: storeName, industry, address, defaultShippingCost: shippingCost, currency },
          {
            onSuccess: (data) => {
              clearPersisted();
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
      bodyClassName="flex h-[520px] flex-col"
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
