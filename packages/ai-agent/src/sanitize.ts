/**
 * Strips markdown syntax the model sometimes emits despite the system
 * prompt's "never use markdown" rule. WhatsApp/Messenger/Instagram render
 * none of this, so leftover ** or # would otherwise show up literally in
 * the customer's chat.
 */
export function stripMarkdown(text: string): string {
  return text
    // Fenced code blocks -> inner content only
    .replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Headers at line start
    .replace(/^#{1,6}\s+/gm, "")
    // Bold/italic (**text**, __text__, *text*, _text_) — require non-space
    // right after the opening marker so we don't eat stray asterisks used
    // as multiplication or emphasis punctuation.
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, "$1")
    .replace(/__(\S(?:[^_]*\S)?)__/g, "$1")
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, "$1")
    .replace(/_(\S(?:[^_]*\S)?)_/g, "$1")
    // Bullet markers at line start
    .replace(/^[ \t]*[-*]\s+/gm, "")
    // Markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}
