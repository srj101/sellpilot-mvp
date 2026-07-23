"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";

import { Button } from "@acme/ui/button";

import type { ConnectedPageItem } from "./connected-pages-list";
import { ConnectedPagesList } from "./connected-pages-list";
import { WhatsAppQrFlow } from "./whatsapp-qr-flow";

export function WhatsAppConnectPanel({
  pages,
}: {
  pages: ConnectedPageItem[];
}) {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  if (isConnecting) {
    return (
      <WhatsAppQrFlow
        onDone={() => {
          setIsConnecting(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      <Button
        size="lg"
        className="w-full bg-[#25D366] text-white hover:bg-[#1faa52]"
        onClick={() => setIsConnecting(true)}
      >
        <Link2 className="mr-2 h-4 w-4" />
        {pages.length > 0 ? "Connect Another Number" : "Connect WhatsApp Number"}
      </Button>

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
