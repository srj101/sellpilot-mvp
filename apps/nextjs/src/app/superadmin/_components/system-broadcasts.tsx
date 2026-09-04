"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Info,
  Loader2,
  Radio,
  Send,
  Sparkles,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

const TARGET_PLANS = [
  { id: "all", label: "All Merchant Stores", description: "Every active and trialing store on SellPilot" },
  { id: "starter", label: "Starter Plan Stores", description: "Only stores on the Starter subscription" },
  { id: "growth", label: "Growth Plan Stores", description: "Only stores on the Growth subscription" },
  { id: "pro", label: "Pro Plan Stores", description: "High-volume stores on the Pro subscription" },
] as const;

const QUICK_TEMPLATES = [
  {
    title: "Scheduled Maintenance Notice",
    body: "We will be performing a 15-minute system optimization tonight at 3:00 AM BST. AI DM replies will queue and process automatically.",
    link: "/dashboard",
  },
  {
    title: "Meta WhatsApp Cloud API Advisory",
    body: "Meta is reporting elevated webhook delivery latency in the South Asia region. Messages are being safely buffered in our queue.",
    link: "/dashboard/integrations",
  },
  {
    title: "New AI Sales Agent Feature Released",
    body: "You can now customize your AI Agent's tone and automated product discount rules directly in Settings > AI Agent.",
    link: "/dashboard/settings?tab=ai",
  },
];

export function SystemBroadcasts() {
  const trpc = useTRPC();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [targetPlan, setTargetPlan] = useState<"all" | "starter" | "growth" | "pro">("all");
  const [recentBroadcasts, setRecentBroadcasts] = useState<
    Array<{ id: string; title: string; body: string; target: string; time: string; count: number }>
  >([]);

  const broadcastMutation = useMutation(
    trpc.superadmin.broadcastNotification.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Broadcast sent successfully to ${data.count} merchant stores!`);
        setRecentBroadcasts((prev) => [
          {
            id: String(Date.now()),
            title,
            body,
            target: targetPlan,
            time: "Just now",
            count: data.count,
          },
          ...prev,
        ]);
        setTitle("");
        setBody("");
        setLink("");
      },
      onError: (err) => {
        toast.error(err.message || "Failed to dispatch broadcast");
      },
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Please enter both a title and message body.");
      return;
    }

    if (
      confirm(
        `Are you sure you want to broadcast this message to ${
          targetPlan === "all" ? "ALL stores" : `${targetPlan} stores`
        }?`,
      )
    ) {
      broadcastMutation.mutate({
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        targetPlan,
      });
    }
  }

  function applyTemplate(tpl: (typeof QUICK_TEMPLATES)[number]) {
    setTitle(tpl.title);
    setBody(tpl.body);
    setLink(tpl.link);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Left Column: Broadcast Composer */}
      <div className="space-y-6">
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BellRing className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Dispatch Merchant Broadcast</CardTitle>
                <CardDescription className="text-xs">
                  Create system-wide notifications that appear in merchant notification bells and banner alerts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Target Audience Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Target Merchant Audience</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TARGET_PLANS.map((plan) => (
                    <div
                      key={plan.id}
                      onClick={() => setTargetPlan(plan.id)}
                      className={cn(
                        "cursor-pointer rounded-xl border p-3 transition-all",
                        targetPlan === plan.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                          : "border-border/60 bg-card hover:border-border",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{plan.label}</span>
                        {targetPlan === plan.id && <Radio className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{plan.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Announcement Title</label>
                <Input
                  placeholder="e.g. Scheduled System Optimization Tonight"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  className="text-xs"
                />
              </div>

              {/* Message Body */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Message Body</label>
                <textarea
                  rows={4}
                  placeholder="Describe the update, advisory, or feature announcement in detail..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={500}
                  className="w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Merchant recipients will receive this in their notifications dropdown.</span>
                  <span>{body.length} / 500</span>
                </div>
              </div>

              {/* Optional Destination Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Action Link <span className="font-normal text-muted-foreground">(Optional)</span>
                </label>
                <Input
                  placeholder="e.g. /dashboard/integrations or /dashboard/settings"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              {/* Live In-App Notification Preview */}
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Live Merchant Preview
                </span>
                <div className="flex items-start gap-3 rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs">
                    📢
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {title ? `📢 ${title}` : "📢 Announcement title will appear here"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {body || "The full announcement body will appear here for merchants."}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">Just now</p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={broadcastMutation.isPending || !title.trim() || !body.trim()}
                  className="gap-1.5 text-xs"
                >
                  {broadcastMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Broadcast to Merchants
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Dispatch History */}
        {recentBroadcasts.length > 0 && (
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Sent in this Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentBroadcasts.map((b) => (
                <div key={b.id} className="flex items-start justify-between rounded-lg border bg-card p-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{b.title}</span>
                      <Badge variant="outline" className="text-[9px] capitalize">
                        {b.target}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground text-[11px]">{b.body}</p>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground shrink-0">
                    <span>Delivered to {b.count} stores</span>
                    <p>{b.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Column: Quick Templates & Operational Advisories */}
      <div className="space-y-6">
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Quick Templates</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Click any template to quickly prefill announcement details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {QUICK_TEMPLATES.map((tpl, i) => (
              <div
                key={i}
                onClick={() => applyTemplate(tpl)}
                className="cursor-pointer rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{tpl.title}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-primary">
                    Apply
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {tpl.body}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-1.5">
              <Info className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm font-semibold">Delivery Architecture</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              Broadcast notifications insert high-priority alerts directly into the platform notification queue.
            </p>
            <p>
              Merchants connected to live dashboard sessions will receive an instant badge increment on their top bar bell, with click-through navigation to the referenced store view.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
