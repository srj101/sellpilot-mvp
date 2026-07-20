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
  ChatMessage,
  ToolCallLog,
  ConversationContext,
} from "./types";
import { SALES_AGENT_SYSTEM_PROMPT, FALLBACK_RESPONSES } from "./prompts";
import { getAllTools, setConnectionContext, setToolContext } from "./tools/index";
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

  constructor(config: AgentConfig) {
    this.debug = config.debug ?? false;

    this.llm = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 800,
    });

    this.tools = getAllTools();
    this.toolNode = new ToolNode(this.tools);
    this.graph = this.buildGraph();

    this.log("Agent initialized", {
      model: config.model,
      toolCount: this.tools.length,
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

  async run(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let llmCalls = 0;
    const toolCalls: ToolCallLog[] = [];

    // Set connection context for media tools
    setConnectionContext(input.context.connectionContext);
    // Set the trusted request context every tool reads userId/threadId from —
    // never let the model supply these itself.
    setToolContext(input.context);

    // Build initial messages
    const messages = this.buildMessages(input);

    this.log("Running agent", {
      userId: input.context.userId,
      threadId: input.context.threadId,
      messageCount: messages.length,
    });

    try {
      const result = await this.graph.invoke(
        { messages },
        { recursionLimit: 15 }
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

      // Count LLM calls and extract tool calls
      for (const msg of finalMessages) {
        if (msg instanceof AIMessage) {
          llmCalls++;
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
    const messages = this.buildMessages(input);

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

  private buildMessages(input: AgentInput): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // System prompt with user context
    const systemPrompt = `${SALES_AGENT_SYSTEM_PROMPT}

Current userId for tool calls: ${input.context.userId}
Platform: ${input.context.platform}
${input.context.customerName ? `Customer name: ${input.context.customerName}` : ""}`;

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

  async run(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    const messages: BaseMessage[] = [
      new SystemMessage(`You are an AI Sales Agent for an ecommerce store.
Help customers find products and answer questions.
Be friendly, concise, and helpful.
Reply in the customer's language.
Never use markdown formatting.

Current userId: ${input.context.userId}`),
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
      const response = await this.llm.invoke(messages);

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

      return {
        response: content ? stripMarkdown(content) : FALLBACK_RESPONSES.error,
        processingTime: Date.now() - startTime,
        llmCalls: 1,
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
