/**
 * AI Agent Type Definitions
 */

// ============================================
// Configuration
// ============================================

export interface AgentConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Base URL for API (OpenRouter, Azure, etc.) */
  baseUrl?: string;
  /** Model to use */
  model: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================
// Context
// ============================================

export interface ConversationContext {
  /** Platform user ID of the business owner — kept for rows that record "who", not "which store". */
  userId: string;
  /** Store (organization) ID — the actual tenant-scoping key. One user can own more than one store. */
  organizationId: string;
  /** Thread ID for conversation history */
  threadId: string;
  /** Platform (facebook, instagram, whatsapp) */
  platform: "facebook_page" | "instagram" | "whatsapp";
  /** Customer/sender ID */
  customerId: string;
  /** Customer name if known */
  customerName?: string;
  /** Connection context for sending messages */
  connectionContext?: ConnectionContext;
}

export interface ConnectionContext {
  platform: "facebook_page" | "instagram" | "whatsapp";
  accessToken: string;
  accountId: string;
  recipientId: string;
  connectionId: string;
}

// ============================================
// Messages
// ============================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Image URLs attached to the message */
  images?: string[];
  /** Timestamp */
  timestamp?: Date;
}

export interface AgentInput {
  /** The user's message */
  message: string;
  /** Attached images (URLs or base64) */
  images?: string[];
  /** Conversation context */
  context: ConversationContext;
  /** Previous messages for context */
  history?: ChatMessage[];
}

export interface AgentOutput {
  /** The agent's response */
  response: string;
  /** Tool calls made during processing */
  toolCalls?: ToolCallLog[];
  /** Processing time in ms */
  processingTime: number;
  /** Number of LLM calls */
  llmCalls: number;
  /** Tokens used */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// ============================================
// Tools
// ============================================

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ConversationContext) => Promise<unknown>;
}

export interface ToolCallLog {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  error?: string;
}

// ============================================
// Logging
// ============================================

export interface AgentLog {
  id: string;
  userId: string;
  threadId: string;
  platform: string;
  input: AgentInput;
  output: AgentOutput;
  toolCalls: ToolCallLog[];
  startedAt: Date;
  completedAt: Date;
  success: boolean;
  error?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ============================================
// State
// ============================================

export interface AgentState {
  messages: ChatMessage[];
  context: ConversationContext;
  toolCalls: ToolCallLog[];
  llmCalls: number;
  startTime: number;
}
