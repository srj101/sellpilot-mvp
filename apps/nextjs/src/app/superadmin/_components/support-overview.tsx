"use client";

import { useState } from "react";
import { BellRing, Bug } from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";

import { BugReports } from "./bug-reports";
import { SystemBroadcasts } from "./system-broadcasts";

type SupportTab = "bugs" | "broadcasts" | "split";

export function SupportOverview() {
  const [activeTab, setActiveTab] = useState<SupportTab>("bugs");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Support & Incident Ops</h1>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
              Unified Comms
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Inbound merchant bug reports and outbound system broadcast notices in a synchronized triage center.
          </p>
        </div>

        {/* View Toggle */}
        <div className="bg-card flex items-center gap-1 rounded-lg border p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("bugs")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeTab === "bugs"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Bug className="h-3.5 w-3.5" />
            Inbound Bug Reports
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("broadcasts")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeTab === "broadcasts"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BellRing className="h-3.5 w-3.5" />
            System Broadcasts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("split")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors hidden xl:flex",
              activeTab === "split"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Split Side-by-Side
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "split" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <Bug className="h-4 w-4 text-rose-500" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Inbound Reports
              </h2>
            </div>
            <BugReports />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <BellRing className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Outbound Broadcasts
              </h2>
            </div>
            <SystemBroadcasts />
          </div>
        </div>
      ) : activeTab === "bugs" ? (
        <BugReports />
      ) : (
        <SystemBroadcasts />
      )}
    </div>
  );
}
