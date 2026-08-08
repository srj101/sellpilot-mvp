"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, User, ShieldAlert, RefreshCw, Filter, Clock } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Skeleton } from "@acme/ui/skeleton";
import { useTRPC } from "~/trpc/react";

const ENTITY_OPTIONS = [
  { value: "all", label: "All Entity Types" },
  { value: "product", label: "Products" },
  { value: "order", label: "Orders" },
  { value: "customer", label: "Customers" },
  { value: "conversation", label: "Inbox / Conversations" },
  { value: "role", label: "Team & Roles" },
  { value: "integration", label: "Integrations" },
  { value: "setting", label: "Settings" },
  { value: "offer", label: "Offers & Discounts" },
  { value: "subscription", label: "Subscription & Billing" },
];

function formatDate(dateString: Date | string) {
  const d = new Date(dateString);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

function getActorBadge(actorType: string) {
  if (actorType === "ai_agent") {
    return (
      <Badge variant="secondary" className="inline-flex items-center gap-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-medium">
        <Bot className="h-3.5 w-3.5" />
        AI Agent
      </Badge>
    );
  }
  if (actorType === "system") {
    return (
      <Badge variant="outline" className="inline-flex items-center gap-1.5 bg-muted text-muted-foreground border-border font-medium">
        <ShieldAlert className="h-3.5 w-3.5" />
        System
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border-primary/20 font-medium">
      <User className="h-3.5 w-3.5" />
      Staff
    </Badge>
  );
}

export default function ActivityClient() {
  const trpc = useTRPC();
  const [selectedEntity, setSelectedEntity] = useState<string>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, refetch } = useQuery(
    trpc.activity.list.queryOptions({
      limit: 25,
      cursor,
      entityType: selectedEntity === "all" ? undefined : selectedEntity,
    }),
  );

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor;

  // Stats calculation
  const staffCount = items.filter((i) => i.actorType === "staff").length;
  const aiCount = items.filter((i) => i.actorType === "ai_agent").length;

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Activity Log & Audit Feed
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comprehensive audit trail of team member, AI sales agent, and store activity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedEntity}
              onChange={(e) => {
                setSelectedEntity(e.target.value);
                setCursor(undefined);
              }}
              className="h-9 w-48 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-2xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Events Listed</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold text-card-foreground">{items.length}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Staff Actions</span>
            <User className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-card-foreground">{staffCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">AI Sales Agent Actions</span>
            <Bot className="h-4 w-4 text-purple-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-card-foreground">{aiCount}</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-base font-semibold text-foreground">No Activity Records Found</p>
            <p className="text-sm mt-1">Actions executed by staff or the AI agent will appear here in real time.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4 text-right">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item: (typeof items)[number]) => (
                  <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs font-mono text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.actorName}</span>
                        {getActorBadge(item.actorType)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-foreground">
                      {item.summary}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <Badge variant="outline" className="capitalize text-muted-foreground border-border bg-background">
                        {item.entityType}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cursor Pagination */}
        {nextCursor && (
          <div className="p-4 border-t border-border text-center bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(nextCursor)}
              className="gap-1.5 text-xs font-medium"
            >
              Load Older Activities
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
