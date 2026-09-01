/**
 * FR-AGT-14 "High-Traffic Queue Prioritization" — under load, resolve shortest-expected
 * queries (stock/price checks) ahead of longer multi-step conversations (order flow,
 * discovery, complaints). Runs synchronously at webhook-receipt time, before enqueue, so
 * it must be cheap: no LLM call — that would add latency and AI-conversation cost to
 * every single inbound message just to decide queue order, defeating the point of a
 * "respond faster under load" feature. A keyword/length heuristic instead.
 *
 * BullMQ's JobOptions.priority (lower = higher priority) is only honored by the Redis
 * provider — a no-op under the memory provider, which has no priority concept. Redis is
 * the production target, so in practice this always applies.
 */

export type MessagePriority = "quick" | "standard";

export const QUEUE_PRIORITY: Record<MessagePriority, number> = {
  quick: 1,
  standard: 5,
};

// Short, high-confidence signals for "just checking something," not an exhaustive NLU
// model — a false "standard" classification only costs a little queue position under
// load, never correctness (the agent itself still handles the message the same way
// either way; this only affects response ordering).
const QUICK_PATTERNS = [
  // English
  /\bprice\b/i,
  /\bhow much\b/i,
  /\bstock\b/i,
  /\bavailable\b/i,
  /\bin stock\b/i,
  /\bsize\b/i,
  // Bangla script
  /দাম/,
  /কত/,
  /আছে/,
  /স্টকে/,
  // Banglish
  /\bdam\b/i,
  /\bkoto\b/i,
  /\bache\b/i,
  /\bstoke\b/i,
];

const MAX_QUICK_LENGTH = 60;

export function classifyMessagePriority(text: string | undefined, hasMedia: boolean): MessagePriority {
  // Images/audio always go through the slower multimodal/transcription path — never quick.
  if (hasMedia) return "standard";

  const trimmed = (text ?? "").trim();
  if (!trimmed || trimmed.length > MAX_QUICK_LENGTH) return "standard";

  return QUICK_PATTERNS.some((pattern) => pattern.test(trimmed)) ? "quick" : "standard";
}
