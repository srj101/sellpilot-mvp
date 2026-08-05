"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Trash2, Zap } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

export function CustomKpiPanel({ businessSlug }: { businessSlug: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [metricType, setMetricType] = useState<"revenue" | "orders" | "aov">("revenue");
  const [targetValue, setTargetValue] = useState("");

  const { data: copilotTier } = useQuery(trpc.analytics.getCopilotAccess.queryOptions());
  const { data: kpis, isPending } = useQuery(trpc.analytics.listCustomKPIs.queryOptions());

  const createKpi = useMutation(
    trpc.analytics.createCustomKPI.mutationOptions({
      onSuccess: () => {
        toast.success("Custom KPI target added");
        setIsModalOpen(false);
        setTitle("");
        setTargetValue("");
        void qc.invalidateQueries({ queryKey: trpc.analytics.listCustomKPIs.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteKpi = useMutation(
    trpc.analytics.deleteCustomKPI.mutationOptions({
      onSuccess: () => {
        toast.success("KPI target removed");
        void qc.invalidateQueries({ queryKey: trpc.analytics.listCustomKPIs.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(targetValue);
    if (!title.trim() || isNaN(val) || val <= 0) {
      toast.error("Please enter a valid title and target value");
      return;
    }
    createKpi.mutate({ title: title.trim(), metricType, targetValue: val });
  }

  if (copilotTier !== "full") {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Target className="h-5 w-5 text-indigo-500" />
              Proactive Weekly Insights & Custom KPI Tracking
            </CardTitle>
            <CardDescription>
              Set target revenue goals and receive weekly proactive AI executive email digests.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            Pro Plan Exclusive
          </Badge>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 shadow-2xs md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-muted-foreground">
              Upgrade to the <strong>Pro Plan</strong> to unlock custom KPI tracking cards and automated weekly performance email digests.
            </p>
            <Link href={`/${businessSlug}/dashboard/pricing`}>
              <Button size="sm" className="gap-1.5 rounded-lg shadow-2xs">
                <Zap className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-500" />
            Custom KPI Target Tracking
          </CardTitle>
          <CardDescription>
            Live progress metrics for your pinned business targets
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Target
        </Button>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading targets...</div>
        ) : !kpis?.length ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
            No custom KPIs tracked yet. Click &quot;Add Target&quot; above to set weekly sales goals.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {kpis.map((kpi) => {
              const barColor = kpi.isAchieved
                ? "bg-emerald-500"
                : kpi.percentage >= 70
                  ? "bg-indigo-500"
                  : "bg-amber-500";

              return (
                <div key={kpi.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-2xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{kpi.title}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{kpi.period} {kpi.metricType}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-rose-500"
                      onClick={() => deleteKpi.mutate({ id: kpi.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-baseline justify-between text-xs pt-1">
                    <span className="font-bold text-foreground">
                      {kpi.metricType === "revenue" || kpi.metricType === "aov" ? `৳${kpi.currentValue.toLocaleString()}` : kpi.currentValue.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      / {kpi.metricType === "revenue" || kpi.metricType === "aov" ? `৳${kpi.targetValue.toLocaleString()}` : kpi.targetValue.toLocaleString()} ({kpi.percentage}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${kpi.percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Custom KPI Target</DialogTitle>
              <DialogDescription>Track progress towards key revenue or order goals.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="kpi-title" className="text-xs font-medium">Target Title</Label>
                <Input
                  id="kpi-title"
                  placeholder="e.g. Weekly Revenue Goal"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="metric-type" className="text-xs font-medium">Metric Type</Label>
                  <select
                    id="metric-type"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={metricType}
                    onChange={(e) => setMetricType(e.target.value as any)}
                  >
                    <option value="revenue">Revenue (৳)</option>
                    <option value="orders">Orders Count</option>
                    <option value="aov">AOV (৳)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="target-value" className="text-xs font-medium">Target Value</Label>
                  <Input
                    id="target-value"
                    type="number"
                    placeholder="e.g. 100000"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createKpi.isPending}>
                  Save Target
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
