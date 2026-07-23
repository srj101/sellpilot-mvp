import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Link2, RefreshCw } from "lucide-react";

import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { getPagesWithInstagram, type FacebookPage } from "@acme/api/meta";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { cancelMetaSelection, connectChannel } from "../actions";
import { ConnectedPagesList } from "../_components/connected-pages-list";
import { FacebookIcon } from "../_components/integration-icons";
import {
  ErrorState,
  FacebookPagePicker,
} from "../_components/meta-account-picker";

const ERROR_MESSAGES: Record<string, string> = {
  save_failed:
    "We couldn't save that Page connection. Please try again — if it keeps failing, the Page's access token or permissions may need to be reviewed.",
  invalid_selection: "That selection was invalid. Please pick a Page again.",
  session_expired:
    "Your connection session expired. Please connect Facebook again.",
  meta_denied: "Facebook login was cancelled or denied.",
  meta_failed: "Something went wrong talking to Facebook. Please try again.",
  invalid_state: "Your session could not be verified. Please try again.",
};

export default async function FacebookIntegrationPage(props: {
  searchParams?: Promise<{ connected?: string; error?: string }>;
  params: Promise<{ storeSlug: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const { storeSlug } = await props.params;

  const caller = await createCaller(await headers());
  const connections = await caller.integrations.list();
  const pages = connections
    .filter((c) => c.platform === "facebook_page")
    .map((c) => ({
      id: c.id,
      name: c.platformAccountName ?? "Facebook Page",
      externalId: c.platformAccountId,
      webhookStatus: c.webhookSubscriptionStatus,
      connectedAt: c.connectedAt,
    }));
  const connectedIds = new Set(
    pages.map((p) => p.externalId).filter((id): id is string => !!id),
  );

  // While the temp user token cookie is live, keep showing every Page on the
  // linked Facebook account so the user can connect several in one sitting
  // instead of re-authenticating for each one (see saveSelectedPage).
  const cookieStore = await cookies();
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;
  const intent = cookieStore.get("meta_channel_intent")?.value;
  const isPicking = !!tempToken && intent === "facebook";

  let availablePages: FacebookPage[] = [];
  let pickerError = "";

  if (isPicking) {
    try {
      const response = await getPagesWithInstagram(tempToken, "facebook");
      availablePages = response.data || [];
    } catch (err) {
      console.error("Failed to load Facebook Pages:", err);
      pickerError =
        err instanceof Error ? err.message : "Failed to load Pages from Meta";
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-lg">
        <Button variant="ghost" size="sm" className="mb-6" asChild>
          <a href={`/${storeSlug}/dashboard/integrations`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Integrations
          </a>
        </Button>

        <div className="bg-card rounded-2xl border p-8 shadow-sm">
          {/* Header: icon/title on the left, account switcher on the right */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]">
                <FacebookIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Facebook</h1>
                <p className="text-muted-foreground text-sm">
                  Auto-reply to Page messages and comments.
                </p>
              </div>
            </div>
            <form action={connectChannel}>
              <input type="hidden" name="channel" value="facebook" />
              <input type="hidden" name="reauth" value="1" />
              <Button type="submit" variant="outline" size="sm" className="shrink-0 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Switch Account
              </Button>
            </form>
          </div>

          {searchParams?.connected ? (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Page connected — auto-reply is now active for it.
            </div>
          ) : null}

          {searchParams?.error ? (
            <div className="border-destructive/20 bg-destructive/5 text-destructive mb-6 flex items-start gap-2 rounded-xl border p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {ERROR_MESSAGES[searchParams.error] ??
                  "Something went wrong. Please try again."}
              </span>
            </div>
          ) : null}

          {/* Connected pages */}
          <div className="mb-6">
            <p className="text-muted-foreground mb-2 text-sm font-medium">
              Connected Pages
            </p>
            <ConnectedPagesList
              pages={pages}
              emptyLabel="No Page connected yet."
            />
          </div>

          {isPicking ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm font-medium">
                  All Pages on this Facebook account — click to connect
                </p>
                <form action={cancelMetaSelection}>
                  <input type="hidden" name="channel" value="facebook" />
                  <Button type="submit" variant="outline" size="sm">
                    Done
                  </Button>
                </form>
              </div>
              {pickerError ? (
                <ErrorState errorMsg={pickerError} />
              ) : (
                <FacebookPagePicker
                  pages={availablePages}
                  connectedIds={connectedIds}
                />
              )}
            </div>
          ) : (
            <form action={connectChannel}>
              <input type="hidden" name="channel" value="facebook" />
              <Button
                type="submit"
                size="lg"
                className="w-full bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
              >
                <Link2 className="mr-2 h-4 w-4" />
                {pages.length > 0
                  ? "Connect Another Page"
                  : "Connect Facebook Page"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
