"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  RefreshCw,
  Terminal,
  XCircle,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

const SEVERITY_CONFIG: Record<string, { label: string; badge: string }> = {
  blocking: {
    label: "Blocking",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  annoying: {
    label: "Annoying",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  suggestion: {
    label: "Suggestion",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_replies: "AI & Conversations",
  orders: "Orders & Checkout",
  products: "Product Catalog",
  payments: "Payment Gateways",
  channels: "WhatsApp / Meta Channels",
  other: "General App",
};

const STATUS_TABS = [
  { key: "open", label: "Open" },
  { key: "seen", label: "Under Review" },
  { key: "fixed", label: "Resolved" },
  { key: "wont_fix", label: "Closed" },
  { key: "all", label: "All Reports" },
] as const;

function formatAge(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BugReports() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<"open" | "seen" | "fixed" | "wont_fix" | "all">("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const reportsQuery = useQuery(trpc.bugReports.listAll.queryOptions({ status: activeStatus }));
  const updateStatusMutation = useMutation(trpc.bugReports.updateStatus.mutationOptions());

  const reports = reportsQuery.data ?? [];

  const filteredReports = reports.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.description.toLowerCase().includes(q) ||
      (r.businessName && r.businessName.toLowerCase().includes(q)) ||
      (r.reporterEmail && r.reporterEmail.toLowerCase().includes(q)) ||
      (r.category && r.category.toLowerCase().includes(q))
    );
  });

  const openCount = reports.filter((r) => r.status === "open").length;
  const blockingCount = reports.filter((r) => r.severity === "blocking" && r.status === "open").length;

  async function handleUpdateStatus(id: string, status: "seen" | "fixed" | "wont_fix") {
    const note = adminNotes[id]?.trim();
    try {
      await updateStatusMutation.mutateAsync({
        id,
        status,
        adminNote: note || undefined,
      });
      toast.success(`Bug marked as ${status === "fixed" ? "Resolved" : status === "seen" ? "Under Review" : "Closed"}`);
      void qc.invalidateQueries({ queryKey: trpc.bugReports.listAll.queryKey() });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Open Tickets
            </CardTitle>
            <Bug className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{openCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Requiring engineering attention</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Blocking Issues
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{blockingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">High severity merchant blockers</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Resolved
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {reports.filter((r) => r.status === "fixed").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Patched and closed across merchants</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveStatus(t.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeStatus === t.key
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search bugs by store, issue or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full sm:w-72 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reportsQuery.refetch()}
            className="h-9 gap-1.5 px-3 text-xs"
            disabled={reportsQuery.isRefetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", reportsQuery.isRefetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Bug Reports Accordion List */}
      {reportsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-semibold text-foreground">No reports matching filter</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              There are no bug reports in the "{activeStatus}" status queue right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const isExpanded = expandedId === report.id;
            const severity = SEVERITY_CONFIG[report.severity] ?? {
              label: report.severity,
              badge: "border-border bg-muted text-muted-foreground",
            };
            const currentNote = adminNotes[report.id] ?? report.adminNote ?? "";

            return (
              <Card
                key={report.id}
                className={cn(
                  "border transition-all duration-200",
                  isExpanded ? "border-primary/40 shadow-sm" : "border-border/60 hover:border-border",
                )}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  className="flex cursor-pointer items-center justify-between gap-4 p-4 select-none"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      className="mt-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] capitalize", severity.badge)}>
                          {severity.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {CATEGORY_LABELS[report.category] ?? report.category}
                        </Badge>
                        <span className="text-xs font-semibold text-foreground truncate">{report.description}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{report.businessName}</span>
                        <span>•</span>
                        <span>Reported {formatAge(report.createdAt)}</span>
                        <span>•</span>
                        <span className="capitalize">{report.status.replace("_", " ")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {report.screenshotUrl && (
                      <span
                        title="Screenshot attached"
                        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <ImageIcon className="h-3 w-3 mr-1" /> Pic
                      </span>
                    )}
                    {report.threadId && (
                      <span
                        title="AI Conversation Linked"
                        className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                      >
                        <MessageSquare className="h-3 w-3 mr-1" /> Thread
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details Pane */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/20 p-5 space-y-5">
                    {/* Full Description */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Issue Description
                      </h4>
                      <div className="rounded-xl border bg-background p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                        {report.description}
                      </div>
                    </div>

                    {/* Metadata Context Grid */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border bg-background p-3">
                        <span className="text-[11px] text-muted-foreground block">Store & Plan</span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-semibold text-foreground">
                            {report.businessName} ({report.businessSlug})
                          </span>
                          <Badge variant="outline" className="text-[9px] capitalize">
                            {report.planKey ?? "Starter"}
                          </Badge>
                        </div>
                        {report.businessSlug && (
                          <Link
                            href={`/${report.businessSlug}/dashboard`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1.5"
                          >
                            Open store dashboard <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>

                      <div className="rounded-lg border bg-background p-3">
                        <span className="text-[11px] text-muted-foreground block">Reporter</span>
                        <p className="text-xs font-semibold text-foreground mt-1">
                          {report.reporterName ?? "Staff Member"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{report.reporterEmail}</p>
                      </div>

                      <div className="rounded-lg border bg-background p-3">
                        <span className="text-[11px] text-muted-foreground block">Context / URL</span>
                        <p className="text-xs font-mono text-foreground mt-1 truncate" title={report.pageUrl ?? ""}>
                          {report.pageUrl ?? "Unknown Page"}
                        </p>
                        {report.threadId && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                            <span>Thread ID:</span>
                            <code className="text-primary font-mono">{report.threadId}</code>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Console Errors Trace */}
                    {report.consoleErrors && report.consoleErrors.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 mb-1.5">
                          <Terminal className="h-3.5 w-3.5" /> Captured Browser Console Errors
                        </div>
                        <pre className="max-h-40 overflow-auto rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-[11px] font-mono leading-relaxed text-rose-600 dark:text-rose-400">
                          {report.consoleErrors.join("\n")}
                        </pre>
                      </div>
                    )}

                    {/* Screenshot Preview */}
                    {report.screenshotUrl && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Captured Screenshot
                        </h4>
                        <div className="relative inline-block overflow-hidden rounded-xl border group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={report.screenshotUrl}
                            alt="Bug report screenshot"
                            className="max-h-64 object-contain cursor-pointer transition-transform duration-200 hover:scale-[1.01]"
                            onClick={() => setSelectedScreenshot(report.screenshotUrl)}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedScreenshot(report.screenshotUrl)}
                            className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white backdrop-blur-xs hover:bg-black/90"
                          >
                            <Eye className="h-3 w-3" /> View full image
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Resolution Actions & Merchant Reply Note */}
                    <div className="rounded-xl border bg-background p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">
                          Resolution Note / Merchant Reply
                        </label>
                        <span className="text-[10px] text-muted-foreground">
                          This note will be logged and visible to the reporting merchant.
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={currentNote}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({
                            ...prev,
                            [report.id]: e.target.value,
                          }))
                        }
                        placeholder="e.g. Fixed Facebook webhook payload parsing. Please verify in your inbox."
                        className="w-full resize-y rounded-lg border bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs"
                            disabled={updateStatusMutation.isPending || report.status === "seen"}
                            onClick={() => handleUpdateStatus(report.id, "seen")}
                          >
                            <Eye className="h-3.5 w-3.5 text-blue-500" />
                            Mark Under Review
                          </Button>

                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={updateStatusMutation.isPending || report.status === "fixed"}
                            onClick={() => handleUpdateStatus(report.id, "fixed")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark Resolved
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                            disabled={updateStatusMutation.isPending || report.status === "wont_fix"}
                            onClick={() => handleUpdateStatus(report.id, "wont_fix")}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Close (Won't Fix)
                          </Button>
                        </div>

                        {report.status === "fixed" && (
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Resolved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Screenshot Modal Lightbox */}
      {selectedScreenshot && (
        <div
          onClick={() => setSelectedScreenshot(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedScreenshot} alt="Full screenshot preview" className="rounded-xl shadow-2xl" />
            <button
              type="button"
              onClick={() => setSelectedScreenshot(null)}
              className="absolute top-3 right-3 rounded-full bg-black/70 p-2 text-white hover:bg-black"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
