/**
 * Abandoned-conversation follow-up sweep (reference doc §4.1 step 9 / FR-AGT-13: "Auto
 * follow-up after configurable delay (default 30 min) referencing last viewed product +
 * incentive"). Finds agentSession rows that went quiet mid-purchase and sends one nudge —
 * a single message per session (gated by followUpSentAt), not a repeating ladder like the
 * billing dunning job, since the spec describes one follow-up, not a retry schedule.
 */
import { and, eq, inArray, isNull, lt } from "@acme/db";
import { db } from "@acme/db/client";
import { agentSession, businessProfile, metaConnection } from "@acme/db/schema";
import type { AgentSessionState } from "@acme/db/schema";
import { MessagingService } from "@acme/messaging";
import type { PlatformConnection, PlatformType } from "@acme/messaging";

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

function buildFollowUpText(state: AgentSessionState): string {
  const item = state.cart?.[0];
  if (item) {
    const variant = item.variantTitle ? ` (${item.variantTitle})` : "";
    return `Still deciding? Your ${item.name}${variant} is still available — reply here anytime to finish your order.`;
  }
  return "Still there? Happy to help you find the right product and get your order sorted — just reply here.";
}

async function sendFollowUp(session: typeof agentSession.$inferSelect): Promise<boolean> {
  const platform = CHANNEL_TO_PLATFORM[session.channel];
  if (!platform || !session.senderId) return false;

  const [conn] = await db
    .select()
    .from(metaConnection)
    .where(and(eq(metaConnection.businessId, session.businessId), eq(metaConnection.platform, platform)))
    .limit(1);
  if (!conn?.accessToken) return false;

  const connection: PlatformConnection = {
    id: conn.id,
    platform,
    userId: conn.userId,
    accountId: conn.platformAccountId,
    accessToken: conn.accessToken,
    isActive: true,
    connectedAt: conn.connectedAt,
  };

  const result = await messagingService.sendMessage(connection, {
    platform,
    recipientId: session.senderId,
    text: buildFollowUpText(session.state),
  });
  return result.success;
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
  const profiles = businessIds.length
    ? await db
        .select({ businessId: businessProfile.businessId, abandonedFollowupMinutes: businessProfile.abandonedFollowupMinutes })
        .from(businessProfile)
        .where(inArray(businessProfile.businessId, businessIds))
    : [];
  const delayByBusiness = new Map(profiles.map((p) => [p.businessId, p.abandonedFollowupMinutes]));

  const now = Date.now();
  const due = candidates.filter((s) => {
    const delayMin = delayByBusiness.get(s.businessId) ?? DEFAULT_FOLLOW_UP_DELAY_MIN;
    return now - s.lastMessageAt.getTime() >= delayMin * 60_000;
  });
  console.log(`[conversation-followup] ${due.length} abandoned session(s) due out of ${candidates.length} candidate(s)`);

  for (const session of due) {
    try {
      const sent = await sendFollowUp(session);
      // Mark attempted either way — a dead/revoked connection shouldn't retry forever
      // and risk hammering a recipient every sweep with a message that keeps failing.
      await db.update(agentSession).set({ followUpSentAt: new Date() }).where(eq(agentSession.id, session.id));
      if (!sent) console.warn(`[conversation-followup] send failed for session ${session.id}`);
    } catch (err) {
      console.error(`[conversation-followup] failed for session ${session.id}:`, err);
    }
  }
}
