/**
 * LangGraph Agent Workflow
 * Organized pipeline for AI agent processing
 */

import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import type {
  AgentConfig,
  AgentInput,
  AgentOutput,
  BusinessProfileSnapshot,
  ChatMessage,
  ToolCallLog,
  ConversationContext,
} from "./types";
import { buildSalesAgentSystemPrompt, FALLBACK_RESPONSES } from "./prompts";
import { getAllTools, getBusinessHelpers, setConnectionContext, setToolContext } from "./tools/index";
import { stripMarkdown } from "./sanitize";

// ============================================
// State Management
// ============================================

interface AgentStateExtension {
  context: ConversationContext;
  toolCalls: ToolCallLog[];
  llmCalls: number;
  startTime: number;
}

// ============================================
// Graph Builder
// ============================================

export class SalesAgentGraph {
  private llm: ChatOpenAI;
  private tools: ReturnType<typeof getAllTools>;
  private toolNode: ToolNode;
  private graph: ReturnType<typeof this.buildGraph>;
  private debug: boolean;
  private planKey: NonNullable<AgentConfig["planKey"]>;

  constructor(config: AgentConfig) {
    this.debug = config.debug ?? false;

    this.llm = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 800,
    });

    this.planKey = config.planKey ?? "starter";
    this.tools = getAllTools(this.planKey);
    this.toolNode = new ToolNode(this.tools);
    this.graph = this.buildGraph();

    this.log("Agent initialized", {
      model: config.model,
      toolCount: this.tools.length,
      planKey: this.planKey,
    });
  }

  private buildGraph() {
    const llmWithTools = this.llm.bindTools(this.tools);

    const callModel = async (state: typeof MessagesAnnotation.State) => {
      this.log("Calling model", { messageCount: state.messages.length });

      try {
        const response = await llmWithTools.invoke(state.messages);

        this.log("Model response", {
          contentLength:
            typeof response.content === "string"
              ? response.content.length
              : "complex",
          toolCalls: response.tool_calls?.length ?? 0,
        });

        return { messages: [response] };
      } catch (error) {
        this.logError("Model call failed", error);
        throw error;
      }
    };

    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage && "tool_calls" in lastMessage) {
        const toolCalls = (lastMessage as AIMessage).tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          this.log("Routing to tools", {
            tools: toolCalls.map((tc) => tc.name),
          });
          return "tools";
        }
      }

      this.log("Routing to END");
      return END;
    };

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode("agent", callModel)
      .addNode("tools", this.toolNode)
      .addEdge(START, "agent")
      .addConditionalEdges("agent", shouldContinue)
      .addEdge("tools", "agent");

    return workflow.compile();
  }

  async run(input: AgentInput, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const startTime = Date.now();
    let llmCalls = 0;
    const toolCalls: ToolCallLog[] = [];

    // Set connection context for media tools
    setConnectionContext(input.context.connectionContext);
    // Set the trusted request context every tool reads userId/threadId from —
    // never let the model supply these itself.
    setToolContext(input.context);

    // Build initial messages
    const messages = await this.buildMessages(input);

    this.log("Running agent", {
      userId: input.context.userId,
      threadId: input.context.threadId,
      messageCount: messages.length,
    });

    try {
      // Passing signal here is what makes an upstream timeout (see
      // apps/worker/src/middleware/circuit-breaker.ts) actually cancel the in-flight
      // LLM call instead of abandoning it as an untracked background request — LangChain
      // forwards this straight to the underlying fetch.
      // Captured before invoke() so the post-hoc analysis below can scope itself to only
      // what THIS run produced — `messages` already includes up to 15 reconstructed
      // historical turns from buildMessages(), and LangGraph's MessagesAnnotation state
      // is cumulative (result.messages = everything in, plus everything new). Without
      // this, llmCalls/tokensUsed/toolCalls all silently double-count every prior turn
      // of the conversation as if it happened in this invocation.
      const initialMessageCount = messages.length;

      const result = await this.graph.invoke(
        { messages },
        { recursionLimit: 25, signal: options?.signal }
      );

      // Extract response
      const finalMessages = result.messages as BaseMessage[];
      const lastMessage = finalMessages[finalMessages.length - 1];

      let response = "";
      if (lastMessage && "content" in lastMessage) {
        if (typeof lastMessage.content === "string") {
          response = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
          response = lastMessage.content
            .map((part: unknown) => {
              if (typeof part === "string") return part;
              if (typeof part === "object" && part !== null && "text" in part) {
                return (part as { text: string }).text;
              }
              return "";
            })
            .filter(Boolean)
            .join("\n");
        }
      }

      if (!response.trim()) {
        response = FALLBACK_RESPONSES.error;
      } else {
        response = stripMarkdown(response);
      }

      // Count LLM calls and extract tool calls — scoped to only messages THIS invocation
      // produced (see initialMessageCount above), not the full cumulative conversation.
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalTokens = 0;

      const newMessages = finalMessages.slice(initialMessageCount);
      for (const msg of newMessages) {
        if (msg instanceof AIMessage) {
          llmCalls++;
          
          if (msg.usage_metadata) {
            totalPromptTokens += msg.usage_metadata.input_tokens ?? 0;
            totalCompletionTokens += msg.usage_metadata.output_tokens ?? 0;
            totalTokens += msg.usage_metadata.total_tokens ?? 0;
          } else if (msg.response_metadata) {
            const meta = msg.response_metadata as any;
            const tokenUsage = meta.tokenUsage || meta.llmOutput?.tokenUsage || meta.estimatedTokenUsage;
            
            if (tokenUsage) {
              totalPromptTokens += tokenUsage.promptTokens ?? tokenUsage.prompt_tokens ?? 0;
              totalCompletionTokens += tokenUsage.completionTokens ?? tokenUsage.completion_tokens ?? 0;
              totalTokens += tokenUsage.totalTokens ?? tokenUsage.total_tokens ?? 0;
            } else {
              // Debug log if we still can't find it
              console.log("[SalesAgent] Could not find token usage in AIMessage metadata:", JSON.stringify(meta));
            }
          }

          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              toolCalls.push({
                name: tc.name,
                input: tc.args as Record<string, unknown>,
                output: null,
                duration: 0,
              });
            }
          }
        }
        if (msg instanceof ToolMessage) {
          const matching = toolCalls.find((tc) => tc.output === null);
          if (matching) {
            try {
              matching.output = JSON.parse(msg.content as string);
            } catch {
              matching.output = msg.content;
            }
          }
        }
      }

      const processingTime = Date.now() - startTime;

      this.log("Agent completed", {
        processingTime,
        llmCalls,
        toolCalls: toolCalls.length,
        responseLength: response.length,
      });

      return {
        response,
        toolCalls,
        processingTime,
        llmCalls,
        tokensUsed: {
          prompt: totalPromptTokens,
          completion: totalCompletionTokens,
          total: totalTokens,
        },
      };
    } catch (error) {
      this.logError("Agent execution failed", error);

      // Rethrow instead of silently returning a canned "success" — the caller
      // (circuit breaker + BullMQ job retry) needs to see this as a real
      // failure, or a single transient hiccup (timeout, rate limit) becomes
      // a permanent wrong reply with zero retry.
      throw error;
    }
  }

  /**
   * Streaming version of run() - returns an async generator for token-by-token streaming
   */
  async *runStream(input: AgentInput): AsyncGenerator<AgentOutput & { delta?: string }, void, unknown> {
    const startTime = Date.now();

    // Set connection context for media tools
    setConnectionContext(input.context.connectionContext);
    setToolContext(input.context);

    // Build initial messages
    const messages = await this.buildMessages(input);

    this.log("Running agent (streaming)", {
      userId: input.context.userId,
      threadId: input.context.threadId,
    });

    try {
      // For streaming, we use the LLM directly with stream mode
      const chatMessages = messages.map((m) => {
        if (m instanceof SystemMessage) return new SystemMessage(m.content);
        if (m instanceof HumanMessage) return new HumanMessage(m.content);
        if (m instanceof AIMessage) return new AIMessage(m.content);
        return m;
      });

      const stream = await this.llm.stream(chatMessages);
      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.content;
        let delta = "";
        if (typeof content === "string") {
          delta = content;
        } else if (Array.isArray(content)) {
          delta = content.map((c) => (typeof c === "string" ? c : "text" in c ? c.text : "")).join("");
        }
        fullResponse += delta;

        yield {
          response: fullResponse,
          delta,
          toolCalls: [],
          processingTime: Date.now() - startTime,
          llmCalls: 1,
        };
      }

      // Final output
      const finalResponse = stripMarkdown(fullResponse) || FALLBACK_RESPONSES.error;
      yield {
        response: finalResponse,
        toolCalls: [],
        processingTime: Date.now() - startTime,
        llmCalls: 1,
      };
    } catch (error) {
      this.logError("Streaming agent execution failed", error);
      throw error;
    }
  }

  private async buildMessages(input: AgentInput): Promise<BaseMessage[]> {
    const messages: BaseMessage[] = [];

    // Fetched fresh per request rather than cached — a business can change its AI Agent
    // settings (persona name, tone, language) at any time, and the next message should
    // reflect that immediately, not whatever was true when the process started. A failed
    // fetch degrades to the generic prompt (buildSalesAgentSystemPrompt(null)) rather than
    // failing the whole conversation over a profile lookup.
    let profile: BusinessProfileSnapshot | null = null;
    try {
      profile = await getBusinessHelpers().getBusinessProfile(input.context.businessId);
    } catch (err) {
      console.error("[SalesAgentGraph] Failed to fetch business profile for prompt:", err);
    }

    // System prompt with user context
    const systemPrompt = `${buildSalesAgentSystemPrompt(profile, input.context.planKey ?? this.planKey)}

Platform: ${input.context.platform}
${input.context.customerName ? `Customer name: ${input.context.customerName}` : ""}
${input.context.conversationSummary ? `Summary of the conversation so far (may be slightly out of date — the messages below are the current source of truth for anything recent): ${input.context.conversationSummary}` : ""}`;

    messages.push(new SystemMessage(systemPrompt));

    // Add conversation history
    if (input.history && input.history.length > 0) {
      const recentHistory = input.history.slice(-20);

      for (const msg of recentHistory) {
        if (msg.role === "assistant") {
          messages.push(new AIMessage(msg.content));
        } else if (msg.role === "user") {
          messages.push(new HumanMessage(msg.content));
        }
      }
    }

    // Add current message
    if (input.images && input.images.length > 0) {
      // Multi-modal message with images
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: input.message },
      ];

      for (const imageUrl of input.images) {
        content.push({
          type: "image_url",
          image_url: { url: imageUrl },
        });
      }

      messages.push(new HumanMessage({ content } as any));
    } else {
      messages.push(new HumanMessage(input.message));
    }

    return messages;
  }

  private log(action: string, data?: Record<string, unknown>): void {
    if (this.debug) {
      console.log(`[SalesAgent] ${action}`, data ?? "");
    }
  }

  private logError(action: string, error: unknown): void {
    console.error(
      `[SalesAgent] ${action}`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

// ============================================
// Simple Chat (No Tools)
// ============================================

export class SimpleChatAgent {
  private llm: ChatOpenAI;
  private debug: boolean;

  constructor(config: AgentConfig) {
    this.debug = config.debug ?? false;

    this.llm = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 800,
    });
  }

  async run(input: AgentInput, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const startTime = Date.now();

    const messages: BaseMessage[] = [
      new SystemMessage(`You are an AI Sales Agent for an ecommerce store.
Help customers find products and answer questions.
Be friendly, concise, and helpful.
Reply in the customer's language.
Never use markdown formatting.`),
    ];

    if (input.history) {
      for (const msg of input.history.slice(-20)) {
        if (msg.role === "assistant") {
          messages.push(new AIMessage(msg.content));
        } else if (msg.role === "user") {
          messages.push(new HumanMessage(msg.content));
        }
      }
    }

    messages.push(new HumanMessage(input.message));

    try {
      const response = await this.llm.invoke(messages, { signal: options?.signal });

      let content = "";
      if (typeof response.content === "string") {
        content = response.content;
      } else if (Array.isArray(response.content)) {
        content = response.content
          .map((part: unknown) =>
            typeof part === "string"
              ? part
              : (part as { text?: string }).text ?? ""
          )
          .join("\n");
      }

      let tokensUsed = undefined;
      if ("usage_metadata" in response && response.usage_metadata) {
        const meta = response.usage_metadata as any;
        tokensUsed = {
          prompt: meta.input_tokens ?? 0,
          completion: meta.output_tokens ?? 0,
          total: meta.total_tokens ?? 0,
        };
      } else if ("response_metadata" in response && response.response_metadata) {
        const meta = response.response_metadata as any;
        const usage = meta.tokenUsage || meta.llmOutput?.tokenUsage || meta.estimatedTokenUsage;
        if (usage) {
          tokensUsed = {
            prompt: usage.promptTokens ?? usage.prompt_tokens ?? 0,
            completion: usage.completionTokens ?? usage.completion_tokens ?? 0,
            total: usage.totalTokens ?? usage.total_tokens ?? 0,
          };
        }
      }

      return {
        response: content ? stripMarkdown(content) : FALLBACK_RESPONSES.error,
        processingTime: Date.now() - startTime,
        llmCalls: 1,
        tokensUsed,
      };
    } catch (error) {
      console.error("[SimpleChatAgent] Error:", error);
      return {
        response: FALLBACK_RESPONSES.error,
        processingTime: Date.now() - startTime,
        llmCalls: 1,
      };
    }
  }
}
