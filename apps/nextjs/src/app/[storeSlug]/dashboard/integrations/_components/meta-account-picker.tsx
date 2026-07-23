import { Check } from "lucide-react";

import { Button } from "@acme/ui/button";

import type { FacebookPage } from "@acme/api/meta";
import { saveSelectedPage } from "../actions";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-8 text-center shadow-sm">
      <p className="text-base font-semibold">{title}</p>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
        {description}
      </p>
    </div>
  );
}

export function ErrorState({ errorMsg }: { errorMsg: string }) {
  return (
    <div className="border-destructive/20 bg-destructive/5 text-destructive rounded-xl border p-4 text-sm">
      <p className="font-semibold">Error Loading Data</p>
      <p className="mt-1 opacity-90">{errorMsg}</p>
      <p className="mt-3">Please try reconnecting your Meta account.</p>
    </div>
  );
}

/**
 * Picker shown while the temp user token cookie is live so the user can
 * choose which Page(s) to connect — stays open across multiple selections
 * (see saveSelectedPage) so several Pages can be added without re-logging in.
 */
export function FacebookPagePicker({
  pages,
  connectedIds,
}: {
  pages: FacebookPage[];
  connectedIds: Set<string>;
}) {
  if (pages.length === 0) {
    return (
      <EmptyState
        title="No Facebook Pages Found"
        description="We couldn't find any Facebook Pages associated with your account. You must be an administrator of at least one Page."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pages.map((page) => {
        const isConnected = connectedIds.has(page.id);
        return (
          <div
            key={page.id}
            className="bg-secondary/30 flex items-center justify-between gap-4 rounded-xl border p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              {page.picture?.data?.url ? (
                <img
                  src={page.picture.data.url}
                  alt={page.name}
                  className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                />
              ) : (
                <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold">
                  {page.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{page.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  Page ID: {page.id}
                </p>
              </div>
            </div>

            {isConnected ? (
              <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs font-medium">
                <Check className="h-4 w-4 text-emerald-600" /> Connected
              </span>
            ) : (
              <form action={saveSelectedPage}>
                <input type="hidden" name="pageId" value={page.id} />
                <input type="hidden" name="pageName" value={page.name} />
                <input
                  type="hidden"
                  name="pageAccessToken"
                  value={page.access_token}
                />
                <Button type="submit" size="sm" className="shrink-0">
                  <Check className="mr-2 h-4 w-4" /> Use this Page
                </Button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Picker shown while the temp user token cookie is live so the user can
 * choose which Instagram Business Account(s) to connect — stays open across
 * multiple selections (see saveSelectedPage) so several accounts can be
 * added without re-logging in.
 */
export function InstagramAccountPicker({
  pages,
  connectedIds,
}: {
  pages: FacebookPage[];
  connectedIds: Set<string>;
}) {
  const igAccounts = pages
    .map((page) => {
      if (!page.instagram_business_account) return null;
      return { ...page.instagram_business_account, page };
    })
    .filter((account): account is NonNullable<typeof account> => !!account);

  if (igAccounts.length === 0) {
    return (
      <EmptyState
        title="No Instagram Business Accounts Found"
        description="We couldn't find any Instagram Business Accounts linked to your Facebook Pages. Make sure the account is converted to a Business or Creator account and linked to a Facebook Page you manage."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {igAccounts.map((account) => {
        const isConnected = connectedIds.has(account.id);
        return (
          <div
            key={account.id}
            className="bg-secondary/30 flex items-center justify-between gap-4 rounded-xl border p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              {account.profile_picture_url ? (
                <img
                  src={account.profile_picture_url}
                  alt={account.username}
                  className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-pink-500/10 text-sm font-bold text-pink-600">
                  {account.username?.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  @{account.username}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  Linked to {account.page.name}
                </p>
              </div>
            </div>

            {isConnected ? (
              <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs font-medium">
                <Check className="h-4 w-4 text-emerald-600" /> Connected
              </span>
            ) : (
              <form action={saveSelectedPage}>
                <input type="hidden" name="pageId" value={account.page.id} />
                <input type="hidden" name="pageName" value={account.page.name} />
                <input
                  type="hidden"
                  name="pageAccessToken"
                  value={account.page.access_token}
                />
                <input type="hidden" name="instagramId" value={account.id} />
                <input
                  type="hidden"
                  name="instagramUsername"
                  value={account.username ?? ""}
                />
                <input
                  type="hidden"
                  name="instagramProfilePictureUrl"
                  value={account.profile_picture_url ?? ""}
                />
                <Button type="submit" size="sm" className="shrink-0">
                  <Check className="mr-2 h-4 w-4" /> Connect
                </Button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
