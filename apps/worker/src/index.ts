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

import { createQueue, createThreadCancelBroadcast, type MetaDMReplyJob, type MetaCommentReplyJob, type OrderStatusNotifyJob } from "@acme/queue";
import { initializeHelpers } from "@acme/ai-agent";
import { MessagingService, type PlatformConnection } from "@acme/messaging";
import { getNotificationPreference, resolveNotificationRecipient } from "@acme/db/helpers/notification-preferences";
import { sendEmail } from "@acme/auth/email";

import { loadConfig } from "./config.js";
import {
  handleDMReply,
  handleCommentReply,
  setHistoryProvider,
  setOutboundLogger,
  setHandlingModeProvider,
  setThreadCancelBroadcast,
} from "./handlers/index.js";
import { runSubscriptionRenewal, runTrialExpirySweep } from "./handlers/subscription-renewal.js";
import { runConversationFollowUp } from "./handlers/conversation-followup.js";
import { runReviewRequestSweep } from "./handlers/review-request.js";
import { handleOrderStatusNotify } from "./handlers/order-status-notify.js";

const DAY_MS = 86_400_000;
const FIVE_MIN_MS = 5 * 60_000;
const HOUR_MS = 60 * 60_000;

const config = loadConfig();

console.log("=".repeat(50));
console.log("SellPilot Worker Service");
console.log("=".repeat(50));
console.log(`Queue Provider: ${config.queueProvider}`);
console.log(`AI Model: ${config.openaiModel}`);
console.log(`Rate Limit: ${config.rateLimitPerHour}/hour`);
console.log(`AI Timeout: ${config.aiTimeoutMs}ms`);
console.log("=".repeat(50));

// Used by sendImageFn (wired into initializeHelpers below) to actually deliver
// sendProductImageTool's images — a separate instance from dm-reply.ts's, see the
// comment at that call site for why that's fine.
const mediaMessagingService = new MessagingService();

// Initialize queue
const queue = createQueue({
  provider: config.queueProvider,
  redis: {
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
  },
});

// Cross-process "cancel the in-flight reply for this thread" broadcast (see
// handleDMReply's cancel-and-restart logic) — only meaningful with the redis queue
// provider; the memory provider is single-process dev only, where a local map alone
// is already enough to catch a superseded reply.
if (config.queueProvider === "redis") {
  setThreadCancelBroadcast(
    createThreadCancelBroadcast({
      host: config.redisHost,
      port: config.redisPort,
      password: config.redisPassword,
    })
  );
}

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
        discoverProducts: aiHelpers.discoverProducts,
        getProductById: aiHelpers.getProductById,
        checkProductStock: aiHelpers.checkProductStock,
        getTopSellingProducts: aiHelpers.getTopSellingProducts,
        listActiveProducts: aiHelpers.listActiveProducts,
        getProductVariants: aiHelpers.getProductVariants,
        getProductsByTag: aiHelpers.getProductsByTag,
        getLowStockProducts: aiHelpers.getLowStockProducts,
      },
      orderHelpers: {
        createCustomerAndOrder: async (params) => {
          const result = await aiHelpers.createCustomerAndOrder(params);
          if (result.success && result.orderId) {
            // FR-SET-04: send new_order email if emailEnabled
            try {
              const { emailEnabled } = await getNotificationPreference(params.businessId, "new_order");
              if (emailEnabled) {
                const recipientEmail = await resolveNotificationRecipient(params.businessId);
                if (recipientEmail) {
                  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
                  await sendEmail({
                    to: recipientEmail,
                    subject: `New order #${result.orderNumber} — ৳${result.total.toLocaleString()}`,
                    html: `<p>New order <strong>#${result.orderNumber}</strong> placed for <strong>৳${result.total.toLocaleString()}</strong>. <a href="${appUrl}/dashboard/orders">View order</a></p>`,
                    text: `New order #${result.orderNumber} placed for ৳${result.total.toLocaleString()}.`,
                  }).catch((err) => console.error("[worker.createCustomerAndOrder] Failed to send new_order email:", err));
                }
              }
              // FR-SET-04: send low_stock emails if any variants crossed threshold
              if (result.lowStockAlerts?.length) {
                const { emailEnabled: lowStockEmailEnabled } = await getNotificationPreference(params.businessId, "low_stock");
                if (lowStockEmailEnabled) {
                  const recipientEmail = await resolveNotificationRecipient(params.businessId);
                  if (recipientEmail) {
                    const alerts = result.lowStockAlerts.map((a) => `${a.name} (${a.remaining} left, threshold: ${a.threshold})`).join(", ");
                    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
                    await sendEmail({
                      to: recipientEmail,
                      subject: `⚠️ Low stock alert — ${result.lowStockAlerts.length} product(s) running low`,
                      html: `<p>Low stock: ${alerts}. <a href="${appUrl}/dashboard/products">View products</a></p>`,
                      text: `Low stock: ${alerts}. View: ${appUrl}/dashboard/products`,
                    }).catch((err) => console.error("[worker.createCustomerAndOrder] Failed to send low_stock email:", err));
                  }
                }
              }
            } catch (err) {
              console.error("[worker.createCustomerAndOrder] Failed to check/send notification emails:", err);
            }
          }
          return result;
        },
        getOrdersForThread: aiHelpers.getOrdersForThread,
        getCustomerByPhone: aiHelpers.getCustomerByPhone,
        getCustomerPurchaseHistory: aiHelpers.getCustomerPurchaseHistory,
        confirmCodForThread: aiHelpers.confirmCodForThread,
        getPendingReviewOrder: aiHelpers.getPendingReviewOrder,
        submitReview: aiHelpers.submitReview,
      },
      businessHelpers: {
        getBusinessProfile: aiHelpers.getBusinessProfile,
        getOfferByCode: aiHelpers.getOfferByCode,
        getComboOffersForProduct: aiHelpers.getComboOffersForProduct,
        getFAQMatches: aiHelpers.getFAQMatches,
        escalateToHuman: async (businessId, threadId, reason) => {
          await aiHelpers.escalateToHuman(businessId, threadId, reason);
          // FR-SET-04: send human_handoff email if emailEnabled
          try {
            const { emailEnabled } = await getNotificationPreference(businessId, "human_handoff");
            if (emailEnabled) {
              const recipientEmail = await resolveNotificationRecipient(businessId);
              if (recipientEmail) {
                const appUrl = process.env.APP_URL ?? "http://localhost:3000";
                await sendEmail({
                  to: recipientEmail,
                  subject: "🙋 Conversation escalated to you",
                  html: `<p>A customer conversation has been escalated and needs your attention. Reason: ${reason}. <a href="${appUrl}/dashboard/inbox">View inbox</a></p>`,
                  text: `A customer conversation has been escalated. Reason: ${reason}. View: ${appUrl}/dashboard/inbox`,
                }).catch((err) => console.error("[worker.escalateToHuman] Failed to send human_handoff email:", err));
              }
            }
          } catch (err) {
            console.error("[worker.escalateToHuman] Failed to check/send notification email:", err);
          }
        },
        logComplaint: aiHelpers.logComplaint,
        routeBulkInquiry: aiHelpers.routeBulkInquiry,
        getActiveCampaigns: aiHelpers.getActiveCampaigns,
        hasPriorPurchases: aiHelpers.hasPriorPurchases,
      },
      checkoutHelpers: {
        quoteOrder: aiHelpers.quoteOrder,
        upsertActiveCart: aiHelpers.upsertActiveCart,
      },
      // Wires up sendProductImageTool (packages/ai-agent/src/tools/media-tools.ts) —
      // previously never provided here, so the tool always failed with "Image sending
      // not configured" regardless of what the model did. A separate MessagingService
      // instance is fine here (own rate-limit tracking, independent of dm-reply.ts's) —
      // image sends are rare enough that double-counting isn't a real concern.
      sendImageFn: async (connectionContext, businessId, productId) => {
        const productResult = await aiHelpers.getProductById(businessId, productId);
        if (!productResult) return { success: false, error: "Product not found" };

        const imageUrl =
          productResult.product.images?.[0] ?? productResult.variants.find((v) => v.imageUrl)?.imageUrl;
        if (!imageUrl) return { success: false, error: "No image available for this product" };

        const connection: PlatformConnection = {
          id: connectionContext.connectionId,
          platform: connectionContext.platform,
          accountId: connectionContext.accountId,
          accessToken: connectionContext.accessToken,
          isActive: true,
          connectedAt: new Date(),
        };

        const sendResult = await mediaMessagingService.sendImage(connection, connectionContext.recipientId, imageUrl);
        return { success: sendResult.success, error: sendResult.error };
      },
    });

    setHistoryProvider({
      getHistory: (businessId, threadId) =>
        aiHelpers.getConversationHistory(businessId, threadId),
    });

    setOutboundLogger({
      logOutbound: (job, messageId, text) =>
        aiHelpers.logOutboundMessage({
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

  // Order status -> chat notification (COD confirmed / payment succeeded on /pay/[token])
  queue.process<OrderStatusNotifyJob>("order-status-notify", async (job) => {
    await handleOrderStatusNotify(job);
  });

  // Billing jobs (billing plan D6) — no native "repeat" option on the shared queue
  // interface, so each run reschedules itself 24h out via onCompleted/onFailed, which
  // fire only once the job's own record has been finalized (see ProcessHooks' doc
  // comment in packages/queue/src/types.ts). Rescheduling inside the handler itself
  // (e.g. a try/finally around the run) was tried before and is a trap: it races the
  // fixed-id reschedule against that same job's still-"active" record, which BullMQ
  // silently no-ops — the chain would run once per worker boot and then stay dead
  // until the next restart, exactly as found live (all three loops here sat dead for
  // over a day despite repeated restarts, until rescheduling was moved to these hooks).
  //
  // Fixed jobId on every (re-)enqueue below, not a random one: BullMQ treats add() with
  // an id that already has a non-terminal (waiting/delayed/active) job as a no-op rather
  // than creating a second job. Without this, every worker restart (e.g. tsx watch
  // reloading on each save in dev) started a brand new, un-deduplicated "forever" chain —
  // after enough restarts you end up with dozens of independent loops all still firing,
  // which is exactly the flood previously reported against conversation-followup.
  const rescheduleSubscriptionRenewal = () =>
    void queue.enqueue("subscription-renewal", {}, { delay: DAY_MS, jobId: "subscription-renewal-loop" });
  queue.process(
    "subscription-renewal",
    async () => {
      await runSubscriptionRenewal();
    },
    { onCompleted: rescheduleSubscriptionRenewal, onFailed: rescheduleSubscriptionRenewal },
  );

  const rescheduleTrialExpirySweep = () =>
    void queue.enqueue("trial-expiry-sweep", {}, { delay: DAY_MS, jobId: "trial-expiry-sweep-loop" });
  queue.process(
    "trial-expiry-sweep",
    async () => {
      await runTrialExpirySweep();
    },
    { onCompleted: rescheduleTrialExpirySweep, onFailed: rescheduleTrialExpirySweep },
  );

  // Runs every 5 minutes (not daily like billing) since it's checking for sessions that
  // just crossed the 30-minute quiet threshold — a daily sweep would mean some customers
  // wait up to 24h for a nudge meant to land 30 minutes after they went quiet.
  const rescheduleConversationFollowUp = () =>
    void queue.enqueue("conversation-followup", {}, { delay: FIVE_MIN_MS, jobId: "conversation-followup-loop" });
  queue.process(
    "conversation-followup",
    async () => {
      await runConversationFollowUp();
    },
    { onCompleted: rescheduleConversationFollowUp, onFailed: rescheduleConversationFollowUp },
  );

  // Hourly, not 5-min like abandoned-cart — the delay window here is a full day, so
  // hourly granularity is more than enough and keeps the sweep's DB load down.
  const rescheduleReviewRequestSweep = () =>
    void queue.enqueue("review-request-sweep", {}, { delay: HOUR_MS, jobId: "review-request-sweep-loop" });
  queue.process(
    "review-request-sweep",
    async () => {
      await runReviewRequestSweep();
    },
    { onCompleted: rescheduleReviewRequestSweep, onFailed: rescheduleReviewRequestSweep },
  );

  console.log("[Worker] Job handlers registered");
}

/** Kicks off the self-rescheduling billing + follow-up jobs shortly after boot. Fixed
 * jobIds (matching the ones used to re-enqueue in registerHandlers above) mean a worker
 * restart converges onto the existing chain instead of starting a duplicate one. */
function scheduleBillingJobs() {
  const initialDelayMs = 30_000;
  void queue.enqueue("subscription-renewal", {}, { delay: initialDelayMs, jobId: "subscription-renewal-loop" });
  void queue.enqueue("trial-expiry-sweep", {}, { delay: initialDelayMs, jobId: "trial-expiry-sweep-loop" });
  void queue.enqueue("conversation-followup", {}, { delay: initialDelayMs, jobId: "conversation-followup-loop" });
  void queue.enqueue("review-request-sweep", {}, { delay: initialDelayMs, jobId: "review-request-sweep-loop" });
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
    await new Promise(() => { });
  } catch (err) {
    console.error("[Worker] Fatal error:", err);
    process.exit(1);
  }
}

main();
