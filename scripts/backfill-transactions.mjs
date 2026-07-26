/**
 * One-time backfill: creates `transaction` ledger rows for orders that were paid before
 * the transaction table existed (billing plan §2.5 checklist item 4). Safe to re-run —
 * skips any order that already has a transaction row.
 *
 * Node resolves `@vercel/postgres` from the script's own location upward, and pnpm only
 * links it under packages/db/node_modules — so run it from there, not the repo root:
 *   cd packages/db && node --env-file=../../.env ../../scripts/backfill-transactions.mjs
 */
import { sql } from "@vercel/postgres";

const { rows: onlinePaid } = await sql`
  SELECT o.id, o.business_id, o.order_number, o.total, o.shipping_cost, o.payment_method, o.payment_confirmed_at
  FROM "order" o
  WHERE o.payment_confirmed_at IS NOT NULL
    AND o.payment_method IS NOT NULL
    AND o.payment_method != 'cod'
    AND NOT EXISTS (SELECT 1 FROM "transaction" t WHERE t.order_id = o.id)
`;

for (const o of onlinePaid) {
  await sql`
    INSERT INTO "transaction" (id, business_id, order_id, reference, method, status, amount, delivery_charge, created_at)
    VALUES (gen_random_uuid()::text, ${o.business_id}, ${o.id}, ${o.order_number}, ${o.payment_method}, 'success', ${o.total}, ${o.shipping_cost}, ${o.payment_confirmed_at})
  `;
}
console.log(`Backfilled ${onlinePaid.length} online-paid orders.`);

const { rows: codOrders } = await sql`
  SELECT o.id, o.business_id, o.order_number, o.total, o.shipping_cost, o.status, o.created_at
  FROM "order" o
  WHERE o.payment_method = 'cod'
    AND o.status NOT IN ('cancelled')
    AND NOT EXISTS (SELECT 1 FROM "transaction" t WHERE t.order_id = o.id)
`;

for (const o of codOrders) {
  const status = o.status === "delivered" ? "success" : "pending";
  await sql`
    INSERT INTO "transaction" (id, business_id, order_id, reference, method, status, amount, delivery_charge, created_at)
    VALUES (gen_random_uuid()::text, ${o.business_id}, ${o.id}, ${o.order_number}, 'cod', ${status}, ${o.total}, ${o.shipping_cost}, ${o.created_at})
  `;
}
console.log(`Backfilled ${codOrders.length} COD orders.`);

process.exit(0);
