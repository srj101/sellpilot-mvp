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
import { InstagramIcon } from "../_components/integration-icons";
import {
  ErrorState,
  InstagramAccountPicker,
} from "../_components/meta-account-picker";

const ERROR_MESSAGES: Record<string, string> = {
  save_failed:
    "We couldn't save that account connection. Please try again — if it keeps failing, the account's access token or permissions may need to be reviewed.",
  invalid_selection: "That selection was invalid. Please pick an account again.",
  session_expired:
    "Your connection session expired. Please connect Instagram again.",
  meta_denied: "Facebook login was cancelled or denied.",
  meta_failed: "Something went wrong talking to Facebook. Please try again.",
  invalid_state: "Your session could not be verified. Please try again.",
  no_instagram_account:
    "That Page has no linked Instagram Business account. Choose a different Page or link one first.",
};

export default async function InstagramIntegrationPage(props: {
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
    .filter((c) => c.platform === "instagram")
    .map((c) => ({
      id: c.id,
      name: c.platformAccountName ? `@${c.platformAccountName}` : "Instagram Account",
      externalId: c.platformAccountId,
      webhookStatus: c.webhookSubscriptionStatus,
      connectedAt: c.connectedAt,
    }));
  const connectedIds = new Set(
    pages.map((p) => p.externalId).filter((id): id is string => !!id),
  );

  // While the temp user token cookie is live, keep showing every Instagram
  // account on the linked Facebook account so the user can connect several
  // in one sitting instead of re-authenticating for each one (see saveSelectedPage).
  const cookieStore = await cookies();
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;
  const intent = cookieStore.get("meta_channel_intent")?.value;
  const isPicking = !!tempToken && intent === "instagram";

  let availablePages: FacebookPage[] = [];
  let pickerError = "";

  if (isPicking) {
    try {
      const response = await getPagesWithInstagram(tempToken, "instagram");
      availablePages = response.data || [];
    } catch (err) {
      console.error("Failed to load Instagram accounts:", err);
      pickerError =
        err instanceof Error
          ? err.message
          : "Failed to load accounts from Meta";
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
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pink-600/10 text-pink-600">
                <InstagramIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Instagram</h1>
                <p className="text-muted-foreground text-sm">
                  Auto-reply to DMs and comments on your posts.
                </p>
              </div>
            </div>
            <form action={connectChannel}>
              <input type="hidden" name="channel" value="instagram" />
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
              Account connected — auto-reply is now active for it.
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

          {/* Connected accounts */}
          <div className="mb-6">
            <p className="text-muted-foreground mb-2 text-sm font-medium">
              Connected Accounts
            </p>
            <ConnectedPagesList
              pages={pages}
              emptyLabel="No account connected yet."
            />
          </div>

          {isPicking ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm font-medium">
                  All Instagram accounts linked to this Facebook account —
                  click to connect
                </p>
                <form action={cancelMetaSelection}>
                  <input type="hidden" name="channel" value="instagram" />
                  <Button type="submit" variant="outline" size="sm">
                    Done
                  </Button>
                </form>
              </div>
              {pickerError ? (
                <ErrorState errorMsg={pickerError} />
              ) : (
                <InstagramAccountPicker
                  pages={availablePages}
                  connectedIds={connectedIds}
                />
              )}
            </div>
          ) : (
            <form action={connectChannel}>
              <input type="hidden" name="channel" value="instagram" />
              <Button
                type="submit"
                size="lg"
                className="w-full bg-gradient-to-br from-[#4F5BD5] via-[#D62976] to-[#962fbf] text-white hover:opacity-90"
              >
                <Link2 className="mr-2 h-4 w-4" />
                {pages.length > 0
                  ? "Connect Another Account"
                  : "Connect Instagram Account"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
