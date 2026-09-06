"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
  XCircle,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card } from "@acme/ui/card";

import { useTRPC } from "~/trpc/react";
import { AiObservability } from "./ai-observability";
import { ChannelHealth } from "./channel-health";
import { QueueHealth } from "./queue-health";

type HealthSection = "all" | "channels" | "queues" | "ai";

export function HealthOverview() {
  const trpc = useTRPC();
  const [activeSection, setActiveSection] = useState<HealthSection>("all");

  const queueQuery = useQuery(trpc.superadmin.getQueueHealth.queryOptions());
  const channelQuery = useQuery(trpc.superadmin.getChannelHealth.queryOptions());
  const aiQuery = useQuery(trpc.superadmin.getAiObservability.queryOptions());

  const isRefreshing =
    queueQuery.isFetching || channelQuery.isFetching || aiQuery.isFetching;

  const handleRefreshAll = () => {
    void queueQuery.refetch();
    void channelQuery.refetch();
    void aiQuery.refetch();
  };

  const queueData = queueQuery.data;
  const channelData = channelQuery.data;
  const aiData = aiQuery.data;

  // Single consolidated platform verdict
  const verdict = useMemo(() => {
    const queueOk = queueData?.isHealthy ?? true;
    const pausedChannelsCount = channelData?.counts.degraded ?? 0;

    if (!queueOk || pausedChannelsCount > 2) {
      return {
        status: "critical" as const,
        label: "Critical Issues Detected",
        description: !queueOk
          ? "Queue worker connection is down or degraded. Background jobs may be stalling."
          : `${pausedChannelsCount} Meta channels are currently paused or disconnected.`,
        colorClass: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
        badgeVariant: "destructive" as const,
      };
    }

    if (pausedChannelsCount > 0) {
      return {
        status: "warning" as const,
        label: "Partial Degradation",
        description: `${pausedChannelsCount} merchant channel(s) require reconnection or permission review.`,
        colorClass: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
        badgeVariant: "outline" as const,
      };
    }

    return {
      status: "healthy" as const,
      label: "All Systems Operational",
      description: "BullMQ job queues, Meta Graph webhooks, and OpenAI API pipelines are healthy.",
      colorClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
      badgeVariant: "outline" as const,
    };
  }, [queueData, channelData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Platform Health & Ops</h1>
            <Badge variant={verdict.badgeVariant} className="text-xs">
              {verdict.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Consolidated real-time operational monitor covering AI pipelines, background workers, and channel webhooks.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs self-start sm:self-auto"
          onClick={handleRefreshAll}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          Refresh Systems
        </Button>
      </div>

      {/* Top Health Banner Card */}
      <Card className={cn("border p-5", verdict.colorClass)}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            {verdict.status === "healthy" ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5" />
            ) : verdict.status === "warning" ? (
              <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-6 w-6 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-base font-bold">{verdict.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{verdict.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-foreground">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span>Queues: </span>
              <span className="font-semibold capitalize">
                {queueData?.isHealthy ? "Healthy" : "Degraded"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-foreground">
              <Radio className="h-3.5 w-3.5 text-blue-500" />
              <span>Channels: </span>
              <span className="font-semibold">
                {channelData?.counts.active ?? 0}/{channelData?.counts.total ?? 0}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-foreground">
              <Bot className="h-3.5 w-3.5 text-violet-500" />
              <span>AI Pipeline: </span>
              <span className="font-semibold">
                {aiData?.kpis.totalConversationsUsed ?? 0} msgs
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Section Switcher Tabs */}
      <div className="flex items-center gap-1 border-b pb-2">
        {[
          { id: "all", label: "Unified View", icon: Activity },
          { id: "channels", label: "Meta Channels", icon: Radio },
          { id: "queues", label: "Queues & Workers", icon: Server },
          { id: "ai", label: "AI Observability", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as HealthSection)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      {activeSection === "all" ? (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-blue-500" />
                Channel Health
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setActiveSection("channels")}
              >
                Inspect All Channels →
              </Button>
            </div>
            <ChannelHealth />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                Queues & Background Workers
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setActiveSection("queues")}
              >
                Inspect All Queues →
              </Button>
            </div>
            <QueueHealth />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                AI Usage & Cost
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setActiveSection("ai")}
              >
                Inspect All AI Metrics →
              </Button>
            </div>
            <AiObservability />
          </section>
        </div>
      ) : activeSection === "channels" ? (
        <ChannelHealth />
      ) : activeSection === "queues" ? (
        <QueueHealth />
      ) : (
        <AiObservability />
      )}
    </div>
  );
}
