"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

const SEVERITY_STYLE: Record<string, string> = {
  blocking: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  annoying: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  suggestion: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const SEVERITY_LABEL: Record<string, string> = {
  blocking: "Blocking",
  annoying: "Annoying",
  suggestion: "Suggestion",
};

const FILTERS = ["open", "seen", "fixed", "wont_fix", "all"] as const;
const FILTER_LABEL: Record<string, string> = {
  open: "Open",
  seen: "Seen",
  fixed: "Fixed",
  wont_fix: "Closed",
  all: "All",
};

function age(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function BugReports() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const reports = useQuery(trpc.bugReports.listAll.queryOptions({ status: filter }));
  const updateStatus = useMutation(trpc.bugReports.updateStatus.mutationOptions());

  async function setStatus(id: string, status: "seen" | "fixed" | "wont_fix") {
    await updateStatus.mutateAsync({ id, status, adminNote: note.trim() || undefined });
    setNote("");
    void qc.invalidateQueries({ queryKey: trpc.bugReports.listAll.queryKey() });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {reports.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !reports.data?.length ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Nothing here.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.data.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <li key={r.id} className="bg-card rounded-xl border">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="hover:bg-muted/40 flex w-full items-start gap-3 p-4 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      SEVERITY_STYLE[r.severity] ?? ""
                    }`}
                  >
                    {SEVERITY_LABEL[r.severity] ?? r.severity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.description}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {r.businessName} · {r.category} · {age(r.createdAt)} ago · {r.status}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t px-4 py-4 text-sm">
                    <p className="whitespace-pre-wrap">{r.description}</p>

                    {/* The captured context — the whole reason this feature exists. */}
                    <dl className="text-muted-foreground grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="inline font-semibold">Page: </dt>
                        <dd className="inline">{r.pageUrl ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Thread: </dt>
                        <dd className="inline font-mono">{r.threadId ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Store: </dt>
                        <dd className="inline">
                          {r.businessName} ({r.businessSlug}) · {r.planKey ?? "?"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Reporter: </dt>
                        <dd className="inline">
                          {r.reporterName ?? "?"} ({r.userRole ?? "?"}) · {r.reporterEmail ?? ""}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="inline font-semibold">Browser: </dt>
                        <dd className="inline">
                          {r.userAgent ?? "—"} · {r.viewport ?? ""}
                        </dd>
                      </div>
                    </dl>

                    {r.consoleErrors?.length ? (
                      <pre className="bg-muted max-h-40 overflow-auto rounded-lg p-3 text-[11px] leading-relaxed">
                        {r.consoleErrors.join("\n")}
                      </pre>
                    ) : null}

                    {r.screenshotUrl ? (
                      <a href={r.screenshotUrl} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.screenshotUrl}
                          alt="Reporter's screenshot"
                          className="max-h-64 rounded-lg border"
                        />
                      </a>
                    ) : null}

                    {r.adminNote ? (
                      <p className="border-primary/30 border-l-2 pl-3 text-xs">{r.adminNote}</p>
                    ) : null}

                    <div className="space-y-2 border-t pt-3">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Reply to the merchant (shown to them, and sent as a notification when you mark it fixed or closed)"
                        className="border-input bg-background w-full resize-y rounded-lg border px-3 py-2 text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void setStatus(r.id, "seen")}>
                          Mark seen
                        </Button>
                        <Button size="sm" onClick={() => void setStatus(r.id, "fixed")}>
                          {updateStatus.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Mark fixed
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void setStatus(r.id, "wont_fix")}
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
