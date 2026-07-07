import { db } from "./client";
import { metaConnection, metaWebhookEvent } from "./schema";

async function main() {
  console.log("=== INSPECTING DATABASE ===");
  try {
    const connections = await db.select().from(metaConnection);
    console.log(`\nConnections found: ${connections.length}`);
    for (const c of connections) {
      console.log(`- Connection ID: ${c.id}`);
      console.log(`  User ID: ${c.userId}`);
      console.log(`  Platform: ${c.platform}`);
      console.log(`  Platform Account ID: ${c.platformAccountId}`);
      console.log(`  WABA ID: ${c.whatsappBusinessAccountId}`);
      console.log(`  WhatsApp Phone Number ID: ${c.whatsappPhoneNumberId}`);
      console.log(`  Page ID: ${c.facebookPageId}`);
      console.log(`  Instagram ID: ${c.instagramBusinessAccountId}`);
    }

    const events = await db.select().from(metaWebhookEvent);
    console.log(`\nEvents found: ${events.length}`);
    for (const e of events) {
      console.log(`- Event ID: ${e.id}`);
      console.log(`  Platform: ${e.platform}`);
      console.log(`  Event Type: ${e.eventType}`);
      console.log(`  Platform Account ID: ${e.platformAccountId}`);
      console.log(`  Connection ID: ${e.metaConnectionId}`);
      console.log(`  User ID: ${e.userId}`);
      console.log(`  Status: ${e.status}`);
      console.log(`  Raw Payload: ${JSON.stringify(e.rawPayload)}`);
    }
  } catch (error) {
    console.error("Inspection failed:", error);
  }
  process.exit(0);
}

void main();
