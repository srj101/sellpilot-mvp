import { sql } from "@vercel/postgres";

async function main() {
  console.log("=== INSPECTING DB CONNECTIONS ===");
  try {
    const connectionsResult = await sql`SELECT * FROM meta_connection`;
    const connections = connectionsResult.rows;
    console.log(`\nConnections found: ${connections.length}`);
    for (const c of connections) {
      console.log(`- Connection ID: ${c.id}`);
      console.log(`  User ID: ${c.user_id}`);
      console.log(`  Platform: ${c.platform}`);
      console.log(`  Platform Account ID: ${c.platform_account_id}`);
      console.log(`  WABA ID: ${c.whatsapp_business_account_id}`);
      console.log(`  WhatsApp Phone Number ID: ${c.whatsapp_phone_number_id}`);
      console.log(`  Page ID: ${c.facebook_page_id}`);
      console.log(`  Instagram ID: ${c.instagram_business_account_id}`);
      console.log(`  Metadata: ${JSON.stringify(c.metadata)}`);
    }
  } catch (error) {
    console.error("Inspection failed:", error);
  }
  process.exit(0);
}

void main();
