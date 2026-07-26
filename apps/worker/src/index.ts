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
  setHandlingModeProvider,
} from "./handlers/index.js";
import { runSubscriptionRenewal, runTrialExpirySweep } from "./handlers/subscription-renewal.js";
import { runConversationFollowUp } from "./handlers/conversation-followup.js";

const DAY_MS = 86_400_000;
const FIVE_MIN_MS = 5 * 60_000;

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
        getComboOffersForProduct: aiHelpers.getComboOffersForProduct,
        getFAQMatches: aiHelpers.getFAQMatches,
      },
      checkoutHelpers: {
        quoteOrder: aiHelpers.quoteOrder,
      },
    });

    setHistoryProvider({
      getHistory: (businessId, threadId) =>
        aiHelpers.getConversationHistory(businessId, threadId),
    });

    setOutboundLogger({
      logOutbound: (job, messageId, text) =>
        aiHelpers.logOutboundMessage({
          userId: job.userId,
          businessId: job.businessId,
          threadId: job.threadId,
          platform: job.platform,
          platformAccountId: job.accountId,
          recipientId: job.recipientId,
          messageId,
          text,
        }),
    });

    setHandlingModeProvider({
      getHandlingMode: (businessId, threadId) =>
        aiHelpers.getConversationHandlingMode(businessId, threadId),
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

  // Billing jobs (billing plan D6) — no native "repeat" option on the shared queue
  // interface, so each run reschedules itself 24h out. The `finally` means a thrown
  // error still keeps the daily cadence alive instead of silently stopping forever.
  queue.process("subscription-renewal", async () => {
    try {
      await runSubscriptionRenewal();
    } finally {
      await queue.enqueue("subscription-renewal", {}, { delay: DAY_MS });
    }
  });

  queue.process("trial-expiry-sweep", async () => {
    try {
      await runTrialExpirySweep();
    } finally {
      await queue.enqueue("trial-expiry-sweep", {}, { delay: DAY_MS });
    }
  });

  // Runs every 5 minutes (not daily like billing) since it's checking for sessions that
  // just crossed the 30-minute quiet threshold — a daily sweep would mean some customers
  // wait up to 24h for a nudge meant to land 30 minutes after they went quiet.
  queue.process("conversation-followup", async () => {
    try {
      await runConversationFollowUp();
    } finally {
      await queue.enqueue("conversation-followup", {}, { delay: FIVE_MIN_MS });
    }
  });

  console.log("[Worker] Job handlers registered");
}

/** Kicks off the self-rescheduling billing + follow-up jobs shortly after boot. Only
 * needed once per environment — if the queue already has one enqueued (e.g. worker
 * restarted), this adds a harmless extra run rather than losing the cadence entirely. */
function scheduleBillingJobs() {
  const initialDelayMs = 30_000;
  void queue.enqueue("subscription-renewal", {}, { delay: initialDelayMs });
  void queue.enqueue("trial-expiry-sweep", {}, { delay: initialDelayMs });
  void queue.enqueue("conversation-followup", {}, { delay: initialDelayMs });
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
    scheduleBillingJobs();

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
