"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, X } from "lucide-react";

import { installConsoleErrorBuffer } from "~/lib/bug-context";
import { ReportForm } from "../report/_components/report-form";

/**
 * A report button on every dashboard page.
 *
 * The sidebar link alone would mean a merchant navigates away from the bug and then
 * describes it from memory — and, critically, the page and conversation they were looking
 * at are lost. Reporting from where the problem is captures the Inbox thread id
 * automatically, which is the difference between "the bot is not working properly" and a
 * report that can be acted on.
 *
 * Hidden on the report page itself, where the full form is already the content.
 */
export function ReportProblemTrigger() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Installed once, here, because this is the only component mounted on every dashboard
  // page. Buffers console errors locally; nothing is sent unless a report is filed.
  useEffect(() => {
    installConsoleErrorBuffer();
  }, []);

  // Close on Escape — a dialog that traps you is worse than no dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname?.endsWith("/dashboard/report")) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="bg-background w-full max-w-2xl rounded-2xl border shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Report a problem</h2>
                <p className="text-muted-foreground text-xs">
                  We'll attach the page you're on: {pathname}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="hover:bg-muted rounded-lg p-1.5"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5">
              {/* The page captured at open time, not at submit time — by the time they
                  finish typing, the pathname is still this dialog's page, but passing it
                  explicitly keeps that true even if navigation happens underneath. */}
              <ReportForm initialPage={pathname ?? undefined} />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        title="Report a problem"
        aria-label="Report a problem"
        className="bg-background hover:bg-muted fixed bottom-5 left-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-105"
      >
        <Bug className="text-muted-foreground h-4 w-4" />
      </button>
    </>
  );
}
