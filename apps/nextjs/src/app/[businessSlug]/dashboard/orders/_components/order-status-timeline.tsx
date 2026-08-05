"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, Truck, Package, XCircle, RotateCcw, User, Bot, RefreshCw } from "lucide-react";
import { Badge } from "@acme/ui/badge";
import { Skeleton } from "@acme/ui/skeleton";
import { useTRPC } from "~/trpc/react";

function getStatusIcon(status: string) {
  switch (status) {
    case "pending":
      return <Clock className="h-3.5 w-3.5 text-(--warning)" />;
    case "confirmed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-(--chart-4)" />;
    case "shipped":
      return <Truck className="h-3.5 w-3.5 text-(--chart-5)" />;
    case "delivered":
      return <Package className="h-3.5 w-3.5 text-(--success)" />;
    case "cancelled":
      return <XCircle className="h-3.5 w-3.5 text-(--destructive)" />;
    case "returned":
      return <RotateCcw className="h-3.5 w-3.5 text-(--warning)" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getChangedByBadge(changedBy: string, name?: string | null) {
  if (changedBy === "ai_agent") {
    return (
      <Badge variant="outline" className="gap-1 border-(--chart-5)/30 bg-(--chart-5)/10 text-(--chart-5) text-[10px] py-0 px-1.5 font-normal">
        <Bot className="h-3 w-3" /> {name ?? "SellPilot AI"}
      </Badge>
    );
  }
  if (changedBy === "system_sweep") {
    return (
      <Badge variant="outline" className="gap-1 border-(--chart-4)/30 bg-(--chart-4)/10 text-(--chart-4) text-[10px] py-0 px-1.5 font-normal">
        <RefreshCw className="h-3 w-3" /> {name ?? "Automated Sweep"}
      </Badge>
    );
  }
  if (changedBy === "customer") {
    return (
      <Badge variant="outline" className="gap-1 border-(--success)/30 bg-(--success)/10 text-(--success) text-[10px] py-0 px-1.5 font-normal">
        <User className="h-3 w-3" /> Customer
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-[10px] py-0 px-1.5 font-normal">
      <User className="h-3 w-3" /> {name ?? "Merchant Staff"}
    </Badge>
  );
}

export function OrderStatusTimeline({ orderId }: { orderId: string }) {
  const trpc = useTRPC();
  const { data: history, isPending } = useQuery(
    trpc.orders.getStatusHistory.queryOptions({ orderId })
  );

  if (isPending) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
        No status history recorded yet for this order.
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Order Status History ({history.length})
      </h4>
      <div className="relative border-l-2 border-border/60 ml-2.5 space-y-4 pl-4 py-1">
        {history.map((item) => (
          <div key={item.id} className="relative group">
            <div className="absolute -left-[23px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border shadow-2xs">
              {getStatusIcon(item.toStatus)}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold capitalize text-foreground">
                  {item.fromStatus ? `${item.fromStatus} → ${item.toStatus}` : item.toStatus}
                </span>
                {getChangedByBadge(item.changedBy, item.changedByName)}
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {new Date(item.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {item.note && (
              <p className="mt-1.5 text-xs bg-muted/40 p-2 rounded-lg text-foreground border border-border/50 font-mono text-[11px]">
                "{item.note}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
