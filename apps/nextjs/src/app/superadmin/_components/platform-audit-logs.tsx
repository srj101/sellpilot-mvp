"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Filter,
  History,
  RefreshCw,
  Search,
  Shield,
  User,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

const ACTION_COLORS: Record<string, string> = {
  "store.suspended": "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "store.reactivated": "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "product.create": "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "order.update_status": "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "team.invite_member": "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function formatTimestamp(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PlatformAuditLogs() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsQuery = useQuery({
    ...trpc.superadmin.getAuditLogs.queryOptions({ limit: 100 }),
    refetchInterval: 20_000,
  });

  const logs = logsQuery.data ?? [];

  const filteredLogs = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.summary.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.actorName.toLowerCase().includes(q) ||
      (log.businessName && log.businessName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Platform Security & Audit Trail
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Immutable log of administrative overrides, team membership modifications, and security events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search audit trail by actor, action or store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full sm:w-72 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void logsQuery.refetch()}
            className="h-9 gap-1.5 px-3 text-xs"
            disabled={logsQuery.isRefetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", logsQuery.isRefetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Logs Table / List */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <History className="h-10 w-10 mb-2 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No audit entries found</p>
              <p className="text-xs mt-0.5">Audit events appear automatically as actions are taken.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                const badgeColor =
                  ACTION_COLORS[log.action] ??
                  "border-border bg-muted text-muted-foreground";

                return (
                  <div key={log.id} className="transition-colors hover:bg-muted/20">
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="flex cursor-pointer items-center justify-between gap-4 p-4 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>

                        <Badge variant="outline" className={cn("text-[10px] font-mono shrink-0", badgeColor)}>
                          {log.action}
                        </Badge>

                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{log.summary}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span className="font-medium text-foreground">{log.actorName}</span>
                            <span>({log.actorType})</span>
                            {log.businessName && (
                              <>
                                <span>•</span>
                                <span>{log.businessName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-muted-foreground shrink-0">
                        <span className="font-medium text-foreground">{timeAgo(log.createdAt)}</span>
                        <p className="text-[10px]">{formatTimestamp(log.createdAt)}</p>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border/40 bg-muted/30 px-6 py-4 space-y-3 text-xs">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Actor ID</span>
                            <code className="text-[11px] font-mono text-foreground">
                              {log.actorUserId ?? "system / automated"}
                            </code>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Target Store</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="font-semibold text-foreground">{log.businessName ?? "—"}</span>
                              {log.businessSlug && (
                                <Link
                                  href={`/${log.businessSlug}/dashboard`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline inline-flex items-center"
                                >
                                  <ArrowUpRight className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Entity Type</span>
                            <span className="font-semibold text-foreground uppercase text-[11px]">
                              {log.entityType}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Entity ID</span>
                            <code className="text-[11px] font-mono text-foreground truncate block">
                              {log.entityId ?? "—"}
                            </code>
                          </div>
                        </div>

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                              Event Metadata Payload
                            </span>
                            <pre className="max-h-36 overflow-auto rounded-lg border bg-background p-3 text-[11px] font-mono text-foreground leading-relaxed">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
