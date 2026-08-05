import { db } from "@acme/db/client";
import { orderStatusHistory } from "@acme/db/schema";

export interface RecordOrderStatusParams {
  businessId: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: "merchant" | "ai_agent" | "system_sweep" | "customer";
  changedById?: string;
  changedByName?: string;
  note?: string;
}

/**
 * Records an order status transition event in order_status_history (FR-ORD-03).
 */
export async function recordOrderStatusChange(params: RecordOrderStatusParams) {
  try {
    await db.insert(orderStatusHistory).values({
      businessId: params.businessId,
      orderId: params.orderId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      changedBy: params.changedBy,
      changedById: params.changedById ?? null,
      changedByName:
        params.changedByName ??
        (params.changedBy === "ai_agent"
          ? "SellPilot AI"
          : params.changedBy === "system_sweep"
          ? "System Automated Sweep"
          : params.changedBy === "customer"
          ? "Customer"
          : "Merchant Staff"),
      note: params.note ?? null,
    });
  } catch (err) {
    console.error("[order-audit] Failed to record order status transition:", err);
  }
}
