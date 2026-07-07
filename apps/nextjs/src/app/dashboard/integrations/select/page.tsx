import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, AlertCircle } from "lucide-react";

import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import {
  getPagesWithInstagram,
  getWhatsAppAccounts,
  FacebookPage,
  WhatsAppBusinessAccount,
} from "~/lib/meta";
import { saveSelectedPage } from "../actions";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-12 text-center shadow-sm">
      <p className="font-semibold text-lg">{title}</p>
      <p className="text-muted-foreground mt-1 max-w-md mx-auto text-sm">
        {description}
      </p>
      <Button className="mt-6" asChild>
        <a href="/dashboard/integrations">Try Again</a>
      </Button>
    </div>
  );
}

function ErrorState({ errorMsg }: { errorMsg: string }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
      <p className="font-semibold">Error Loading Data</p>
      <p className="mt-1 opacity-90">{errorMsg}</p>
      <p className="mt-3">Please try reconnecting your Meta account.</p>
    </div>
  );
}

function WhatsAppAccountGrid({
  accounts,
}: {
  accounts: WhatsAppBusinessAccount[];
}) {
  if (accounts.length === 0) {
    return (
      <EmptyState
        title="No WhatsApp Business Accounts Found"
        description="We couldn't find any WhatsApp Business Accounts associated with your account. You must be an administrator of at least one."
      />
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="bg-card flex flex-col rounded-2xl border p-6 shadow-sm transition-all duration-200 hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border">
              {account.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{account.name}</h3>
              <p className="text-muted-foreground text-xs mt-0.5">
                Business ID: {account.id}
              </p>
            </div>
          </div>

          <div className="border-t pt-5 mt-auto flex flex-col gap-4">
            {account.phone_numbers?.map((phone) => (
              <div
                key={phone.id}
                className="flex items-center gap-3 bg-green-500/5 rounded-xl border border-green-500/10 p-3"
              >
                <div>
                  <p className="font-semibold text-sm">{phone.verified_name}</p>
                  <p className="text-green-600 text-xs font-medium">
                    {phone.display_phone_number}
                  </p>
                </div>
              </div>
            ))}

            <form action={saveSelectedPage}>
              <input type="hidden" name="channel" value="whatsapp" />
              <input type="hidden" name="wabaId" value={account.id} />
              <input type="hidden" name="wabaName" value={account.name} />
              <input
                type="hidden"
                name="phoneNumberId"
                value={account.phone_numbers?.[0]?.id || ""}
              />
              <input
                type="hidden"
                name="phoneNumber"
                value={account.phone_numbers?.[0]?.display_phone_number || ""}
              />
              <Button type="submit" className="w-full mt-2">
                <Check className="mr-2 h-4 w-4" /> Use this Account
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

function InstagramAccountGrid({ pages }: { pages: FacebookPage[] }) {
  const igAccounts = pages
    .map((page) => {
      if (!page.instagram_business_account) return null;
      return {
        ...page.instagram_business_account,
        page, // keep a reference to the page
      };
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
    <div className="grid gap-6 sm:grid-cols-2">
      {igAccounts.map((account) => (
        <div
          key={account.id}
          className="bg-card flex flex-col rounded-2xl border p-6 shadow-sm transition-all duration-200 hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-6">
            {account.profile_picture_url ? (
              <img
                src={account.profile_picture_url}
                alt={account.username}
                className="h-12 w-12 rounded-xl object-cover border"
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-pink-500/10 text-pink-600 flex items-center justify-center font-bold text-lg border">
                {account.username?.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="font-bold text-lg leading-tight">
                @{account.username}
              </h3>
              <p className="text-muted-foreground text-xs mt-0.5">
                Linked to {account.page.name}
              </p>
            </div>
          </div>

          <div className="border-t pt-5 mt-auto">
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
                value={account.username || ""}
              />
              <input
                type="hidden"
                name="instagramProfilePictureUrl"
                value={account.profile_picture_url || ""}
              />
              <Button type="submit" className="w-full mt-2">
                <Check className="mr-2 h-4 w-4" /> Connect this Account
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

function PageGrid({ pages }: { pages: FacebookPage[] }) {
  if (pages.length === 0) {
    return (
      <EmptyState
        title="No Facebook Pages Found"
        description="We couldn't find any Facebook Pages associated with your account. You must be an administrator of at least one Page."
      />
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {pages.map((page) => (
        <div
          key={page.id}
          className="bg-card flex flex-col rounded-2xl border p-6 shadow-sm transition-all duration-200 hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-6">
            {page.picture?.data?.url ? (
              <img
                src={page.picture.data.url}
                alt={page.name}
                className="h-12 w-12 rounded-xl object-cover border"
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border">
                {page.name.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="font-bold text-lg leading-tight">{page.name}</h3>
              <p className="text-muted-foreground text-xs mt-0.5">
                Page ID: {page.id}
              </p>
            </div>
          </div>

          <div className="border-t pt-5 mt-auto flex flex-col gap-4">
            {page.instagram_business_account ? (
              <div className="flex items-center gap-3 bg-pink-500/5 rounded-xl border border-pink-500/10 p-3">
                {page.instagram_business_account.profile_picture_url ? (
                  <img
                    src={page.instagram_business_account.profile_picture_url}
                    alt={page.instagram_business_account.username}
                    className="h-8 w-8 rounded-full object-cover border"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-pink-500/10 text-pink-600 flex items-center justify-center font-bold text-xs border">
                    IG
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm">
                    Instagram Account Connected
                  </p>
                  <p className="text-pink-600 text-xs font-medium">
                    @{page.instagram_business_account.username}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary/30 p-3 text-xs text-muted-foreground">
                No Instagram Business account connected to this Page.
              </div>
            )}

            <form action={saveSelectedPage}>
              <input type="hidden" name="pageId" value={page.id} />
              <input type="hidden" name="pageName" value={page.name} />
              <input
                type="hidden"
                name="pageAccessToken"
                value={page.access_token}
              />
              <input
                type="hidden"
                name="instagramId"
                value={page.instagram_business_account?.id || ""}
              />
              <input
                type="hidden"
                name="instagramUsername"
                value={page.instagram_business_account?.username || ""}
              />
              <input
                type="hidden"
                name="instagramProfilePictureUrl"
                value={
                  page.instagram_business_account?.profile_picture_url || ""
                }
              />
              <Button type="submit" className="w-full mt-2">
                <Check className="mr-2 h-4 w-4" /> Use this Page
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SelectMetaPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const channel = cookieStore.get("meta_channel_intent")?.value;
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;

  if (!tempToken) {
    return (
      <DashboardShell>
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="mb-2 text-xl font-bold">Meta Session Expired</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            The temporary connection session expired or is invalid. Please go
            back to integrations and try again.
          </p>
          <Button asChild className="w-full">
            <a href="/dashboard/integrations">
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </a>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  let pages: FacebookPage[] = [];
  let whatsappAccounts: WhatsAppBusinessAccount[] = [];
  let errorMsg = "";

  try {
    if (channel === "whatsapp") {
      whatsappAccounts = await getWhatsAppAccounts(tempToken);
    } else {
      const pagesResponse = await getPagesWithInstagram(tempToken, channel);
      pages = pagesResponse.data || [];
    }
  } catch (err) {
    console.error("Failed to fetch data from Meta:", err);
    errorMsg =
      err instanceof Error ? err.message : "Failed to load data from Meta API";
  }

  const TITLES = {
    facebook: "Select Facebook Page",
    instagram: "Select Instagram Account",
    whatsapp: "Select WhatsApp Account",
  };

  const DESCRIPTIONS = {
    facebook:
      "Choose the specific Facebook Page to connect for messages and comments.",
    instagram:
      "Choose the Instagram Business Account to connect for DMs and story replies.",
    whatsapp:
      "Choose the WhatsApp Business Account and phone number to connect.",
  };

  const content = errorMsg ? (
    <ErrorState errorMsg={errorMsg} />
  ) : channel === "whatsapp" ? (
    <WhatsAppAccountGrid accounts={whatsappAccounts} />
  ) : channel === "instagram" ? (
    <InstagramAccountGrid pages={pages} />
  ) : (
    <PageGrid pages={pages} />
  );

  return (
    <DashboardShell>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {TITLES[channel as keyof typeof TITLES] ?? "Select Account"}
          </h1>
          <p className="text-muted-foreground mt-1 text-base">
            {DESCRIPTIONS[channel as keyof typeof DESCRIPTIONS] ??
              "Choose the account to connect to SellPilot."}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/dashboard/integrations">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Integrations
          </a>
        </Button>
      </div>
      {content}
    </DashboardShell>
  );
}
