/**
 * Abandoned-conversation follow-up sweep (reference doc §4.1 step 9 / FR-AGT-13: "Auto
 * follow-up after configurable delay (default 30 min) referencing last viewed product +
 * incentive"). Finds agentSession rows that went quiet mid-purchase and sends one nudge —
 * a single message per session (gated by followUpSentAt), not a repeating ladder like the
 * billing dunning job, since the spec describes one follow-up, not a retry schedule.
 *
 * Tiered per spec §6 "Abandoned Cart Recovery": Starter gets nothing, Growth gets a
 * generic nudge (never references the product), Pro gets a real LLM-personalized message
 * built from the actual active cart (every item, not just one) recorded by quoteOrderTool
 * (see packages/db/src/helpers/aiHelpers.ts's upsertActiveCart) in the dedicated `cart`
 * table — agentSession itself only still drives the "is this thread mid-purchase and
 * quiet long enough" prefilter below, not what to reference in the message.
 */
import { and, eq, inArray, isNull, lt } from "@acme/db";
import { db } from "@acme/db/client";
import { agentSession, businessProfile, cart, metaConnection } from "@acme/db/schema";
import { getBusinessProfile, getComboOffersForProduct, createNotification } from "@acme/db/helpers/aiHelpers";
import type { ActiveCartItem } from "@acme/db/helpers/aiHelpers";
import { MessagingService } from "@acme/messaging";
import type { PlatformConnection, PlatformType } from "@acme/messaging";
import { createSalesAgent } from "@acme/ai-agent";
import type { PlanKey } from "@acme/api/plans";

import { loadConfig } from "../config.js";
import { checkAiConversationAvailability, incrementAiConversation } from "../lib/ai-conversations.js";
import { getBusinessPlanKeys } from "../lib/plan.js";

const DEFAULT_FOLLOW_UP_DELAY_MIN = 30; // the spec's stated default, and businessProfile's column default
// Cheap SQL-level prefilter only, to keep the candidate set small — the real, per-business
// delay (businessProfile.abandonedFollowupMinutes) is checked in JS below, since a single
// SQL WHERE can't vary its cutoff by business. This floor just skips scanning sessions
// that are only seconds old, which no realistic delay setting would ever fire on yet.
const MIN_POSSIBLE_DELAY_MS = 60_000;

// Steps where the customer was mid-purchase and worth nudging. Skips "browsing" (nothing
// concrete to reference yet), "order_placed" (nothing to recover), and "support" (a
// human-handling flow, not something a sales follow-up should interrupt).
const RECOVERABLE_STEPS = new Set([
  "product_selected",
  "cart_active",
  "collecting_customer",
  "awaiting_confirmation",
]);

// agentSession.channel uses the AI-agent's own vocabulary; metaConnection.platform uses
// Meta's. "web" has no messaging integration to send through, so it's left unmapped.
const CHANNEL_TO_PLATFORM: Partial<Record<string, PlatformType>> = {
  messenger: "facebook_page",
  instagram: "instagram",
  whatsapp: "whatsapp",
};

const messagingService = new MessagingService();
const config = loadConfig();

/** Growth's tier, and Pro's fallback when no cart item was ever recorded — deliberately
 * never mentions a product, price, or discount. */
function buildGenericFollowUpText(): string {
  return "Still there? Happy to help you find the right product and get your order sorted — just reply here.";
}

/** Pro tier: a real LLM call composing a message from every item in the actual active
 * cart + any live combo incentive for the first one. Falls back to the generic text on
 * any failure — a nudge should still go out even if personalization fails. */
async function generatePersonalizedFollowUp(
  businessId: string,
  items: ActiveCartItem[],
): Promise<{ text: string; usedAi: boolean }> {
  try {
    const primary = items[0]!;
    const [profile, combos] = await Promise.all([
      getBusinessProfile(businessId).catch(() => null),
      getComboOffersForProduct(businessId, primary.productId).catch(() => []),
    ]);

    const combo = combos[0];
    const incentive = combo
      ? `${combo.partnerProductName ?? "a partner product"} — ${combo.type === "fixed" ? `৳${combo.value} off` : `${combo.value}% off`} (offer: ${combo.title})`
      : null;
    const itemsDescription = items
      .map((i) => `"${i.name}${i.variantTitle ? ` (${i.variantTitle})` : ""}" priced at ${i.unitPrice}${i.qty > 1 ? ` (x${i.qty})` : ""}`)
      .join(items.length > 2 ? ", " : " and ");

    const prompt = `Write ONE short follow-up message (1-2 sentences, plain text, no markdown, no emojis unless it fits naturally) to send a customer on WhatsApp/Messenger/Instagram who was looking at ${itemsDescription} but never finished their order. Gently remind them it's still available and invite them to continue — do not sound pushy. ${incentive ? `You may naturally mention this active combo offer if it fits: ${incentive}.` : ""} Match a ${profile?.conversationTone ?? "friendly"} tone for ${profile?.name ?? "the store"}. Never invent any other price, discount, or product detail. Output only the message text — nothing else, no quotes around it.`;

    const agent = createSalesAgent({
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiModel,
      simple: true,
      debug: config.debug,
    });

    const result = await agent.run({
      message: prompt,
      context: {
        userId: "system",
        businessId,
        threadId: "conversation-followup",
        platform: "whatsapp",
        customerId: "system",
      },
    });

    const text = result.response.trim();
    return { text: text || buildGenericFollowUpText(), usedAi: true };
  } catch (err) {
    console.error("[conversation-followup] Personalized message generation failed, using generic fallback:", err);
    return { text: buildGenericFollowUpText(), usedAi: false };
  }
}

async function resolveFollowUpText(
  businessId: string,
  userId: string,
  threadId: string,
  planKey: PlanKey,
): Promise<{ text: string; usedAi: boolean; items: ActiveCartItem[] }> {
  const [activeCart] = await db
    .select({ items: cart.items })
    .from(cart)
    .where(and(eq(cart.userId, userId), eq(cart.threadId, threadId), eq(cart.status, "active")));
  const items = activeCart?.items ?? [];

  if (planKey !== "pro" || items.length === 0) {
    // Growth never references the cart even if one exists; Pro with an empty/no cart
    // (customer never got as far as a real price quote) also falls back to generic text.
    return { text: buildGenericFollowUpText(), usedAi: false, items };
  }

  const hasConversations = await checkAiConversationAvailability(businessId);
  if (!hasConversations) return { text: buildGenericFollowUpText(), usedAi: false, items };

  const result = await generatePersonalizedFollowUp(businessId, items);
  return { ...result, items };
}

async function sendFollowUp(session: typeof agentSession.$inferSelect, planKey: PlanKey): Promise<{ success: boolean; items: ActiveCartItem[] }> {
  const platform = CHANNEL_TO_PLATFORM[session.channel];
  if (!platform || !session.senderId) return { success: false, items: [] };

  const [conn] = await db
    .select()
    .from(metaConnection)
    .where(and(eq(metaConnection.businessId, session.businessId), eq(metaConnection.platform, platform)))
    .limit(1);
  if (!conn?.accessToken) return { success: false, items: [] };

  const connection: PlatformConnection = {
    id: conn.id,
    platform,
    userId: conn.userId,
    accountId: conn.platformAccountId,
    accessToken: conn.accessToken,
    isActive: true,
    connectedAt: conn.connectedAt,
  };

  const { text, usedAi, items } = await resolveFollowUpText(session.businessId, session.userId, session.threadId, planKey);

  const result = await messagingService.sendMessage(connection, {
    platform,
    recipientId: session.senderId,
    text,
  });

  if (result.success && usedAi) {
    await incrementAiConversation(session.businessId).catch((err) => {
      console.error(`[conversation-followup] Failed to increment conversation count for ${session.businessId}:`, err);
    });
  }

  return { success: result.success, items };
}

export async function runConversationFollowUp(): Promise<void> {
  const prefilterCutoff = new Date(Date.now() - MIN_POSSIBLE_DELAY_MS);
  const quiet = await db
    .select()
    .from(agentSession)
    .where(and(lt(agentSession.lastMessageAt, prefilterCutoff), isNull(agentSession.followUpSentAt)));

  const candidates = quiet.filter((s) => RECOVERABLE_STEPS.has(s.state.currentStep ?? ""));

  // Batched, not one lookup per session — the delay setting is the only thing needed from
  // businessProfile here, and most sessions in a sweep share a small set of businesses.
  const businessIds = [...new Set(candidates.map((s) => s.businessId))];
  const [profiles, planByBusiness] = await Promise.all([
    businessIds.length
      ? db
          .select({ businessId: businessProfile.businessId, abandonedFollowupMinutes: businessProfile.abandonedFollowupMinutes })
          .from(businessProfile)
          .where(inArray(businessProfile.businessId, businessIds))
      : Promise.resolve([]),
    getBusinessPlanKeys(businessIds),
  ]);
  const delayByBusiness = new Map(profiles.map((p) => [p.businessId, p.abandonedFollowupMinutes]));

  const now = Date.now();
  const due = candidates.filter((s) => {
    const delayMin = delayByBusiness.get(s.businessId) ?? DEFAULT_FOLLOW_UP_DELAY_MIN;
    return now - s.lastMessageAt.getTime() >= delayMin * 60_000;
  });

  // Starter gets no abandoned-cart follow-up at all (spec §6). Still marked as handled so
  // the sweep doesn't re-evaluate the same stale Starter session every 5 minutes forever.
  const skipped = due.filter((s) => (planByBusiness.get(s.businessId) ?? "starter") === "starter");
  const sendable = due.filter((s) => (planByBusiness.get(s.businessId) ?? "starter") !== "starter");

  console.log(
    `[conversation-followup] ${sendable.length} due (Growth/Pro), ${skipped.length} skipped (Starter), out of ${candidates.length} candidate(s)`,
  );

  if (skipped.length > 0) {
    await db
      .update(agentSession)
      .set({ followUpSentAt: new Date() })
      .where(inArray(agentSession.id, skipped.map((s) => s.id)));
  }

  for (const session of sendable) {
    const planKey = planByBusiness.get(session.businessId) ?? "starter";
    try {
      const { success: sent, items } = await sendFollowUp(session, planKey);
      // Mark attempted either way — a dead/revoked connection shouldn't retry forever
      // and risk hammering a recipient every sweep with a message that keeps failing.
      await db.update(agentSession).set({ followUpSentAt: new Date() }).where(eq(agentSession.id, session.id));
      if (sent) {
        const itemNames = items.map((i) => i.name).join(", ");
        await createNotification({
          businessId: session.businessId,
          type: "abandoned_followup_sent",
          title: "Abandoned conversation follow-up sent",
          body: itemNames ? `Nudged a customer about ${itemNames}` : "Nudged a customer who went quiet mid-purchase",
          link: "/dashboard/inbox",
        }).catch((err) => console.error(`[conversation-followup] Failed to create notification for session ${session.id}:`, err));
      } else {
        console.warn(`[conversation-followup] send failed for session ${session.id}`);
      }
    } catch (err) {
      console.error(`[conversation-followup] failed for session ${session.id}:`, err);
    }
  }
}
