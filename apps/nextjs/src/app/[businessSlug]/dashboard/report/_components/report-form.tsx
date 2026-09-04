"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bug, ImageUp, Loader2, X } from "lucide-react";

import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { captureBugContext } from "~/lib/bug-context";

const CATEGORIES = [
  { value: "ai_replies", label: "AI replies" },
  { value: "orders", label: "Orders" },
  { value: "products", label: "Products & import" },
  { value: "payments", label: "Payments" },
  { value: "channels", label: "Channels" },
  { value: "other", label: "Something else" },
] as const;

/** Phrased as consequences, not as P1/P2/P3 — a merchant knows whether they can keep
 * working, and does not know what a severity level is. */
const SEVERITIES = [
  { value: "blocking", label: "I can't work", hint: "Something is completely broken" },
  { value: "annoying", label: "Annoying, but I can continue", hint: "Wrong or awkward, not blocking" },
  { value: "suggestion", label: "A suggestion", hint: "An idea or improvement" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  seen: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  fixed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  wont_fix: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  seen: "We've seen it",
  fixed: "Fixed",
  wont_fix: "Closed",
};

export function ReportForm({ initialPage }: { initialPage?: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [category, setCategory] = useState<string>("ai_replies");
  const [severity, setSeverity] = useState<string>("annoying");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<{ file: File; preview: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reports = useQuery(trpc.bugReports.listMine.queryOptions());
  const create = useMutation(trpc.bugReports.create.mutationOptions());
  const getUploadUrl = useMutation(trpc.bugReports.getScreenshotUploadUrl.mutationOptions());

  function pickScreenshot(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That image is over 5MB — please attach a smaller one.");
      return;
    }
    setScreenshot({ file, preview: URL.createObjectURL(file) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 5) {
      toast.error("Please describe what happened.");
      return;
    }

    setSubmitting(true);
    try {
      let screenshotS3Key: string | undefined;
      if (screenshot) {
        // Presigned PUT straight to S3 — the image never passes through our API.
        const { uploadUrl, key } = await getUploadUrl.mutateAsync({
          contentType: screenshot.file.type,
        });
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: screenshot.file,
          headers: { "Content-Type": screenshot.file.type },
        });
        // A failed upload must not lose the report the merchant just wrote.
        if (put.ok) screenshotS3Key = key;
        else toast.error("The screenshot didn't upload, but your report was still sent.");
      }

      await create.mutateAsync({
        category: category as never,
        severity: severity as never,
        description: description.trim(),
        screenshotS3Key,
        ...captureBugContext(),
        // The page they were on when the trigger opened beats the page they ended up on.
        pageUrl: initialPage ?? captureBugContext().pageUrl,
      });

      toast.success("Sent — thank you. We'll look into it.");
      setDescription("");
      setScreenshot(null);
      void qc.invalidateQueries({ queryKey: trpc.bugReports.listMine.queryKey() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="bg-card space-y-5 rounded-2xl border p-6 shadow-sm">
        <div>
          <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
            What's it about?
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  category === c.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
            How bad is it?
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  severity === s.value ? "border-primary bg-primary/5" : "bg-background hover:bg-muted"
                }`}
              >
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="text-muted-foreground block text-xs">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
            What happened?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Tell us what you did and what went wrong. Your own words are fine — Bangla or English."
            className="border-input bg-background/50 focus:bg-background focus-visible:ring-ring w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />
          <p className="text-muted-foreground mt-1.5 text-xs">
            We automatically attach the page you were on, your store and plan, and any recent
            errors — you don't need to describe any of that.
          </p>
        </div>

        <div>
          <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
            Screenshot (optional)
          </label>
          {screenshot ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot.preview}
                alt="Screenshot to attach"
                className="max-h-48 rounded-xl border"
              />
              <button
                type="button"
                onClick={() => setScreenshot(null)}
                className="bg-background absolute -top-2 -right-2 rounded-full border p-1 shadow"
                aria-label="Remove screenshot"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
              <ImageUp className="text-muted-foreground h-4 w-4" />
              Attach a screenshot
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => pickScreenshot(e.target.files?.[0])}
              />
            </label>
          )}
          {/* Said plainly, because the merchant is the one deciding: an Inbox screenshot
              carries their customers' real names, phone numbers and addresses. */}
          <p className="text-muted-foreground mt-1.5 flex items-start gap-1.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A screenshot of your Inbox or Orders may show your customers' names, phone numbers
            and addresses. Only attach one if you're comfortable sharing that with us.
          </p>
        </div>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bug className="mr-2 h-4 w-4" />}
          {submitting ? "Sending…" : "Send report"}
        </Button>
      </form>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Your reports</h2>
        {reports.isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !reports.data?.length ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
            Nothing reported yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.data.map((r) => (
              <li key={r.id} className="bg-secondary/30 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">{r.description}</p>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      STATUS_STYLE[r.status] ?? STATUS_STYLE.open
                    }`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 text-xs">
                  <span>{CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  {r.pageUrl ? <span>{r.pageUrl}</span> : null}
                </div>
                {r.adminNote ? (
                  <p className="border-primary/30 mt-2 border-l-2 pl-3 text-xs">{r.adminNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
