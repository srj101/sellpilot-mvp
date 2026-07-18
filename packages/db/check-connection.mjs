import { db } from "./src/client.ts";
import { metaConnection } from "./src/schema.ts";
import { eq } from "drizzle-orm";

const rows = await db.select().from(metaConnection).where(eq(metaConnection.platform, "facebook_page"));
for (const r of rows) {
  console.log(JSON.stringify({
    id: r.id,
    userId: r.userId,
    platformAccountId: r.platformAccountId,
    facebookPageId: r.facebookPageId,
    hasAccessToken: !!(r.accessToken || r.facebookPageAccessToken),
  }, null, 2));
}
console.log("total:", rows.length);
process.exit(0);
