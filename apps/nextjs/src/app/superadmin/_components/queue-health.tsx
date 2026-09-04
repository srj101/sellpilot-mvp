"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  ListOrdered,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

export function QueueHealth() {
  const trpc = useTRPC();
  const queueQuery = useQuery(trpc.superadmin.getQueueHealth.queryOptions());
  const data = queueQuery.data;

  if (queueQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const summary = data?.summary ?? {
    totalActive: 0,
    totalWaiting: 0,
    totalFailed: 0,
    totalCompleted: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Queues & Worker Engine</h2>
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                data?.isHealthy
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "border-rose-500/30 text-rose-500"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  data?.isHealthy ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                )}
              />
              {data?.isHealthy ? "Cluster Healthy" : "System Degraded"}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              Provider: {data?.provider ?? "redis"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Live health telemetry for BullMQ workers, job backlogs, and background event queues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => void queueQuery.refetch()}
            disabled={queueQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", queueQuery.isFetching && "animate-spin")} />
            Refresh Queues
          </Button>
        </div>
      </div>

      {/* Aggregate Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Jobs */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Processing
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Zap className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold tracking-tight">{summary.totalActive}</div>
              {summary.totalActive > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping" />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Jobs currently executing on worker pods
            </p>
          </CardContent>
        </Card>

        {/* Waiting / Queued */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Waiting in Queue
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{summary.totalWaiting}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Pending jobs ready for worker pickup
            </p>
          </CardContent>
        </Card>

        {/* Failed Jobs */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Failed Jobs (DLQ)
            </CardTitle>
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                summary.totalFailed > 0
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold tracking-tight",
                summary.totalFailed > 0 && "text-rose-600 dark:text-rose-400"
              )}
            >
              {summary.totalFailed}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.totalFailed > 0
                ? "Jobs exhausted retries (Dead Letter Queue)"
                : "All queue workers operating clean"}
            </p>
          </CardContent>
        </Card>

        {/* Total Completed */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Jobs Processed
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {summary.totalCompleted.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Successful executions in the current retention window
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Individual Queue Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Registered Worker Queues</h3>
          <span className="text-xs text-muted-foreground">
            {data?.queues.length ?? 0} active channels
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data?.queues.map((q) => (
            <Card key={q.id} className="border-border/60 transition-all hover:border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold">{q.name}</CardTitle>
                    <CardDescription className="text-xs line-clamp-2">
                      {q.description}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      q.status === "healthy"
                        ? "outline"
                        : q.status === "degraded"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px] shrink-0 capitalize"
                  >
                    {q.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Active</span>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        q.stats.active > 0 && "text-blue-500"
                      )}
                    >
                      {q.stats.active}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Waiting</span>
                    <span className="font-mono font-bold text-foreground">
                      {q.stats.waiting}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Failed</span>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        q.stats.failed > 0 ? "text-rose-500" : "text-muted-foreground"
                      )}
                    >
                      {q.stats.failed}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Channel key:</span>
                  <code className="font-mono text-[10px] text-foreground bg-muted px-1 py-0.5 rounded">
                    {q.id}
                  </code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
