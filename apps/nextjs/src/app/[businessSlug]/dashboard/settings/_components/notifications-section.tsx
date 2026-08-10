import { AlertTriangle, BarChart3, Bell, Bot, Save, ShoppingCart, UserRound } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Switch } from "@acme/ui/switch";

import { SectionCard } from "./section-card";
import type { NotifPrefs } from "./types";

const NOTIFICATION_EVENTS: { id: string; icon: React.ElementType; title: string; desc: string }[] = [
  {
    id: "new_order",
    icon: ShoppingCart,
    title: "New Order Placed",
    desc: "Notify when a customer places an order via social chat or web checkout.",
  },
  {
    id: "low_stock",
    icon: AlertTriangle,
    title: "Low Stock Warning",
    desc: "Alert when product inventory drops to or below its low-stock threshold.",
  },
  {
    id: "human_handoff",
    icon: UserRound,
    title: "Human Handoff Request",
    desc: "Alert when a customer requests a human agent or triggers complaint routing.",
  },
  {
    id: "quota_alert",
    icon: BarChart3,
    title: "Quota & Storage Overage",
    desc: "Alert at 80% and 100% monthly AI conversation or storage limits.",
  },
  {
    id: "weekly_insights",
    icon: Bot,
    title: "Weekly Executive AI Insight Digest",
    desc: "Weekly report with AI sales growth analysis and recommendations.",
  },
];

export function NotificationsSection({
  notifPrefs,
  onToggle,
  saving,
  onSave,
}: {
  notifPrefs: NotifPrefs;
  onToggle: (eventType: string, channel: "emailEnabled" | "inAppEnabled", value: boolean) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <SectionCard
      icon={Bell}
      title="Notifications & System Alerts"
      description="Configure event notification preferences for email alerts and in-app notifications."
    >
      <div className="space-y-4">
        {NOTIFICATION_EVENTS.map((evt) => {
          const current = notifPrefs[evt.id] ?? { emailEnabled: true, inAppEnabled: true };
          const Icon = evt.icon;
          return (
            <div key={evt.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b last:border-0">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{evt.title}</p>
                  <p className="text-xs text-muted-foreground">{evt.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Email</span>
                  <Switch
                    checked={current.emailEnabled}
                    onCheckedChange={(val) => onToggle(evt.id, "emailEnabled", val)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">In-App</span>
                  <Switch
                    checked={current.inAppEnabled}
                    onCheckedChange={(val) => onToggle(evt.id, "inAppEnabled", val)}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end border-t pt-4">
          <Button onClick={onSave} disabled={saving} className="gap-2 rounded-lg">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Notification Preferences"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
