"use client";

import type { ConnectedPageItem } from "./connected-pages-list";
import { ConnectedPagesList } from "./connected-pages-list";
import { WhatsAppConnectButton } from "./whatsapp-connect-button";

export function WhatsAppConnectPanel({
  pages,
}: {
  pages: ConnectedPageItem[];
}) {
  return (
    <>
      <WhatsAppConnectButton />

      <div className="mt-6">
        <p className="text-muted-foreground mb-2 text-sm font-medium">
          Connected Numbers
        </p>
        <ConnectedPagesList
          pages={pages}
          emptyLabel="No WhatsApp number connected yet."
        />
      </div>
    </>
  );
}
