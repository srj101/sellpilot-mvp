import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import OpenAI from "openai";

import { and, eq, desc } from "@acme/db";
import { db } from "@acme/db/client";
import {
  customer,
  order,
  orderItem,
  product,
  productVariant,
  metaConnection,
  metaWebhookEvent,
} from "@acme/db/schema";
import { buildInboxData } from "./meta-inbox";

import { env } from "~/env";

const apiKey = env.OPENAI_API_KEY;
const baseURL = env.OPENAI_BASE_URL;
const model = env.OPENAI_MODEL ?? "openrouter/free";

const client = new OpenAI({
  apiKey,
  baseURL,
});

interface SearchProductsArgs {
  keyword: string;
  userId: string;
}
interface GetProductArgs {
  id: string;
  userId: string;
}
interface CheckStockArgs {
  id: string;
  userId: string;
}
interface CreateOrderArgs {
  productId: string;
  quantity: number;
  customerName: string;
  phone: string;
  address: string;
  userId: string;
}

interface ToolHandlerMap {
  searchProducts(args: SearchProductsArgs): Promise<unknown>;
  getProduct(args: GetProductArgs): Promise<unknown>;
  checkStock(args: CheckStockArgs): Promise<unknown>;
  createOrder(args: CreateOrderArgs): Promise<unknown>;
}

type ToolName = keyof ToolHandlerMap;

type ChatMessage = ChatCompletionMessageParam;

// Minimal tool wrappers the model can call via the OpenAI-compatible tool-calling flow
export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchProducts",
      description: "Search products from inventory",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string" },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProduct",
      description: "Get product by id",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkStock",
      description: "Check product stock",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createOrder",
      description: "Create customer order",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number" },
          customerName: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
        },
        required: [
          "productId",
          "quantity",
          "customerName",
          "phone",
          "address",
        ],
      },
    },
  },
];

export const availableTools: ToolHandlerMap = {
  async searchProducts({ keyword, userId }: SearchProductsArgs) {
    console.log("[AI][tool] searchProducts called", { keyword, userId });
    const rows = await db
      .select()
      .from(product)
      .where(eq(product.userId, userId));

    const searchWords = keyword
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);

    const matches = rows.filter((p) => {
      const title = (p.title ?? "").toLowerCase();
      const description = (p.description ?? "").toLowerCase();
      if (searchWords.length === 0) return false;
      return searchWords.every((word) => title.includes(word) || description.includes(word));
    });

    const results = [];
    for (const p of matches) {
      const variants = await db
        .select()
        .from(productVariant)
        .where(eq(productVariant.productId, p.id));
      const first = variants[0];
      results.push({
        id: p.id,
        name: p.title,
        price: first?.price ?? 0,
        stock: first?.inventoryQuantity ?? 0,
      });
    }

    return results;
  },

  async getProduct({ id, userId }: GetProductArgs) {
    console.log("[AI][tool] getProduct called", { id, userId });
    const [p] = await db
      .select()
      .from(product)
      .where(and(eq(product.id, id), eq(product.userId, userId)));
    if (!p) return null;
    const variants = await db
      .select()
      .from(productVariant)
      .where(eq(productVariant.productId, p.id));
    return { product: p, variants };
  },

  async checkStock({ id, userId }: CheckStockArgs) {
    console.log("[AI][tool] checkStock called", { id, userId });
    const variants = await db
      .select()
      .from(productVariant)
      .where(eq(productVariant.productId, id));
    if (variants.length === 0) return { stock: 0 };
    const total = variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
    return { stock: total };
  },

  async createOrder({
    productId,
    quantity,
    customerName,
    phone,
    address,
    userId,
  }: CreateOrderArgs) {
    console.log("[AI][tool] createOrder called", {
      productId,
      quantity,
      customerName,
      phone: phone.replace(/(\d{3})\d+(\d{2})/, "$1***$2"),
      address,
      userId,
    });
    // Very small, transactional-like creation. Validate product and stock
    // Find product and a variant (use first variant if none specified)
    const [p] = await db
      .select()
      .from(product)
      .where(and(eq(product.id, productId), eq(product.userId, userId)));
    if (!p) return { success: false, error: "Product not found" };

    const variants = await db
      .select()
      .from(productVariant)
      .where(eq(productVariant.productId, p.id));
    const variant = variants[0];
    if (!variant)
      return { success: false, error: "No variant available for product" };
    if (variant.inventoryQuantity < quantity)
      return { success: false, error: "Insufficient stock" };

    const [cust] = await db
      .insert(customer)
      .values({ userId, name: customerName, phone, address })
      .returning();

    if (!cust) {
      return { success: false, error: "Unable to create customer" };
    }

    const [created] = await db
      .insert(order)
      .values({
        userId,
        customerId: cust.id,
        orderNumber: `SP-${Date.now()}`,
        status: "pending",
        subtotal: variant.price * quantity,
        shippingCost: 0,
        discountAmount: 0,
        total: variant.price * quantity,
        customerName,
        customerPhone: phone,
        customerEmail: null,
        shippingAddress: address,
      })
      .returning();

    if (!created) {
      return { success: false, error: "Unable to create order" };
    }

    await db.insert(orderItem).values({
      orderId: created.id,
      productId,
      variantId: variant.id,
      name: p.title,
      variantTitle: variant.title,
      qty: quantity,
      unitPrice: variant.price,
      lineTotal: variant.price * quantity,
      imageUrl: variant.imageUrl,
    });

    // decrement variant inventory
    await db
      .update(productVariant)
      .set({ inventoryQuantity: variant.inventoryQuantity - quantity })
      .where(eq(productVariant.id, variant.id))
      .returning();

    return { success: true, orderId: created.id };
  },
};

export async function runChat(
  message: string,
  userId: string,
  threadId?: string,
): Promise<string> {
  console.log("[AI] runChat start", { userId, message: message.slice(0, 200), threadId });
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a professional sales agent.\n\nNever hallucinate.\nAlways use tools to search products.\nNever make up prices.\nAlways check stock before recommending.`,
    },
  ];

  if (threadId) {
    try {
      const [events, connections] = await Promise.all([
        db
          .select()
          .from(metaWebhookEvent)
          .where(eq(metaWebhookEvent.userId, userId))
          .orderBy(desc(metaWebhookEvent.receivedAt))
          .limit(300),
        db
          .select()
          .from(metaConnection)
          .where(eq(metaConnection.userId, userId))
          .orderBy(desc(metaConnection.connectedAt)),
      ]);

      const data = buildInboxData({ events, connections });
      const thread = data.threads.find((t) => t.id === threadId);

      if (thread) {
        const sorted = [...thread.messages].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );

        let history = sorted;
        const lastMsg = history[history.length - 1];
        let includeCurrentInHistory = false;

        if (
          lastMsg &&
          lastMsg.text === message &&
          lastMsg.direction === "inbound"
        ) {
          includeCurrentInHistory = true;
        }

        const recent = history.slice(-50);

        for (const msg of recent) {
          messages.push({
            role: msg.direction === "outbound" ? "assistant" : "user",
            content: msg.text,
          });
        }

        if (!includeCurrentInHistory) {
          messages.push({ role: "user", content: message });
        }
      } else {
        messages.push({ role: "user", content: message });
      }
    } catch (e) {
      console.error("[AI] Failed to load chat history:", e);
      messages.push({ role: "user", content: message });
    }
  } else {
    messages.push({ role: "user", content: message });
  }
  try {
    console.log("[AI] sending LLM request", {
      model,
      messagesCount: messages.length,
      tools: tools.length,
    });
    const resp = await client.chat.completions.create({
      model,
      messages,
      tools,
      max_tokens: 800,
    });

    console.log("[AI] LLM response received", {
      choices: resp.choices.length,
    });

    const firstChoice = resp.choices[0];
    if (!firstChoice?.message) {
      throw new Error("OpenAI response did not include a message");
    }

    let assistant = firstChoice.message as ChatCompletionAssistantMessageParam;
    messages.push(assistant);

    // follow tool call loop
    while (assistant.tool_calls?.length) {
      for (const toolCall of assistant.tool_calls) {
        if (toolCall.type !== "function") continue;

        const fnName = toolCall.function.name as ToolName;
        const rawArgs = toolCall.function.arguments ?? "{}";
        let args: unknown;
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = {};
        }

        console.log("[AI] tool_call", { id: toolCall.id, fnName, args });

        if (!(fnName in availableTools)) {
          throw new Error(`Unknown tool requested: ${fnName}`);
        }

        const handler = availableTools[fnName] as unknown as (
          args: Record<string, unknown>,
        ) => Promise<unknown>;
        const mergedArgs = { ...(args as Record<string, unknown>), userId };
        const result = await handler(mergedArgs);
        console.log("[AI] tool_result", { fnName, result });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        } as ChatCompletionToolMessageParam);
      }

      const next = await client.chat.completions.create({
        model,
        messages,
        tools,
      });
      const nextChoice = next.choices[0];
      if (!nextChoice?.message) {
        throw new Error("OpenAI follow-up response did not include a message");
      }
      assistant = nextChoice.message as ChatCompletionAssistantMessageParam;
      console.log("[AI] LLM follow-up response", {
        choices: next.choices.length,
        tool_calls: assistant.tool_calls?.length,
      });
      messages.push(assistant);
    }

    let contentStr = "";
    if (typeof assistant.content === "string") {
      contentStr = assistant.content;
    } else if (Array.isArray(assistant.content)) {
      contentStr = assistant.content
        .map((part) => {
          if (part.type === "text") {
            return part.text;
          }
          if (part.type === "refusal") {
            return part.refusal;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    console.log("[AI] runChat finished successfully", { userId });
    return contentStr;
  } catch (err: unknown) {
    console.error("[AI] runChat error", {
      userId,
      message: message.slice(0, 200),
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    throw err;
  }
}

export default client;
