/**
 * Trusted per-run tool context.
 *
 * Tool schemas must never accept userId/threadId/customerId as LLM-supplied
 * arguments — a malicious or confused customer message could otherwise trick
 * the model into passing a different tenant's ID. Instead the real,
 * server-verified ConversationContext is stashed here once per agent run
 * (see SalesAgentGraph.run) and tools read it directly.
 */
import type { ConversationContext } from "../types";

let current: ConversationContext | null = null;

export function setToolContext(ctx: ConversationContext): void {
  current = ctx;
}

export function getToolContext(): ConversationContext {
  if (!current) {
    throw new Error(
      "Tool context not set. setToolContext must be called before invoking any tool.",
    );
  }
  return current;
}
