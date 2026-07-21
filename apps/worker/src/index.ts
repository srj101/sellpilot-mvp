/**
 * Worker Service Entry Point
 *
 * This worker processes background jobs for:
 * - DM auto-replies (Facebook, Instagram, WhatsApp)
 * - Comment auto-replies
 * - Product image indexing
 *
 * Usage:
 *   pnpm --filter @acme/worker dev    # Development
 *   pnpm --filter @acme/worker start  # Production
 */

import { createQueue, type MetaDMReplyJob, type MetaCommentReplyJob } from "@acme/queue";
import { initializeHelpers } from "@acme/ai-agent";

import { loadConfig } from "./config.js";
import {
  handleDMReply,
  handleCommentReply,
  setHistoryProvider,
  setOutboundLogger,
} from "./handlers/index.js";

const config = loadConfig();

console.log("=".repeat(50));
console.log("SellPilot Worker Service");
console.log("=".repeat(50));
console.log(`Queue Provider: ${config.queueProvider}`);
console.log(`AI Model: ${config.openaiModel}`);
console.log(`Rate Limit: ${config.rateLimitPerHour}/hour`);
console.log(`AI Timeout: ${config.aiTimeoutMs}ms`);
console.log("=".repeat(50));

// Initialize queue
const queue = createQueue({
  provider: config.queueProvider,
  redis: {
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
  },
});

// Initialize AI helpers (lazy loaded to avoid circular deps)
async function initializeAIHelpers() {
  try {
    // Dynamic import to avoid bundling issues
    await import("@acme/db/client");
    const helpersModule = await import("@acme/db/helpers/aiHelpers");

    const aiHelpers = helpersModule.aiHelpers;

    initializeHelpers({
      aiHelpers: {
        searchProductsByKeyword: aiHelpers.searchProductsByKeyword,
        getProductById: aiHelpers.getProductById,
        checkProductStock: aiHelpers.checkProductStock,
        getTopSellingProducts: aiHelpers.getTopSellingProducts,
        listActiveProducts: aiHelpers.listActiveProducts,
        getProductVariants: aiHelpers.getProductVariants,
        getProductsByTag: aiHelpers.getProductsByTag,
        getLowStockProducts: aiHelpers.getLowStockProducts,
      },
      orderHelpers: {
        createCustomerAndOrder: aiHelpers.createCustomerAndOrder,
        getOrdersForThread: aiHelpers.getOrdersForThread,
        getCustomerByPhone: aiHelpers.getCustomerByPhone,
      },
      businessHelpers: {
        getBusinessProfile: aiHelpers.getBusinessProfile,
        getOfferByCode: aiHelpers.getOfferByCode,
        getFAQMatches: aiHelpers.getFAQMatches,
      },
      checkoutHelpers: {
        quoteOrder: aiHelpers.quoteOrder,
      },
    });

    setHistoryProvider({
      getHistory: (userId, threadId) =>
        aiHelpers.getConversationHistory(userId, threadId),
    });

    setOutboundLogger({
      logOutbound: (job, messageId, text) =>
        aiHelpers.logOutboundMessage({
          userId: job.userId,
          threadId: job.threadId,
          platform: job.platform,
          platformAccountId: job.accountId,
          recipientId: job.recipientId,
          messageId,
          text,
        }),
    });

    console.log("[Worker] AI helpers initialized");
  } catch (err) {
    console.error("[Worker] Failed to initialize AI helpers:", err);
    console.log("[Worker] Running without database helpers");
  }
}

// Register job handlers
function registerHandlers() {
  // DM Reply Handler
  queue.process<MetaDMReplyJob>("meta-dm-reply", async (job) => {
    await handleDMReply(job);
  });

  // Comment Reply Handler
  queue.process<MetaCommentReplyJob>("meta-comment-reply", async (job) => {
    await handleCommentReply(job);
  });

  console.log("[Worker] Job handlers registered");
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}, shutting down...`);

  try {
    await queue.close();
    console.log("[Worker] Queue closed");
  } catch (err) {
    console.error("[Worker] Error closing queue:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Health check endpoint (optional, for Docker health checks)
async function startHealthCheck() {
  const http = await import("http");

  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      const healthy = await queue.isHealthy();
      res.writeHead(healthy ? 200 : 503);
      res.end(JSON.stringify({ status: healthy ? "healthy" : "unhealthy" }));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  const port = parseInt(process.env.WORKER_HEALTH_PORT ?? "3001");
  server.listen(port, () => {
    console.log(`[Worker] Health check listening on port ${port}`);
  });
}

// Main
async function main() {
  try {
    await initializeAIHelpers();
    registerHandlers();

    if (process.env.WORKER_HEALTH_PORT) {
      await startHealthCheck();
    }

    console.log("[Worker] Ready to process jobs");

    // Keep the process running
    await new Promise(() => {});
  } catch (err) {
    console.error("[Worker] Fatal error:", err);
    process.exit(1);
  }
}

main();
