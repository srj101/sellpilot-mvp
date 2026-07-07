import Link from "next/link";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Link2, Settings2, Unlink } from "lucide-react";

import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "./integration-icons";
import { connectChannel } from "../actions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  whatsapp: WhatsAppIcon,
};

const COLORS: Record<string, string> = {
  facebook: "text-[#1877F2] bg-[#1877F2]/10",
  instagram: "text-pink-600 bg-pink-600/10",
  whatsapp: "text-[#25D366] bg-[#25D366]/10",
};

export interface IntegrationCardProps {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  account?: string | null;
  connectionId?: string;
}

export function IntegrationCard({
  id,
  name,
  description,
  connected,
  account,
  connectionId,
}: IntegrationCardProps) {
  const Icon = ICONS[id] ?? FacebookIcon;
  const colorClass = COLORS[id] ?? "text-primary bg-primary/10";

  return (
    <div className="bg-card group flex flex-col rounded-xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorClass}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <Badge variant={connected ? "success" : "secondary"}>
          {connected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      <div className="mb-1 text-lg font-semibold">{name}</div>
      <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
        {description}
      </p>

      {connected && account ? (
        <p className="text-muted-foreground mb-4 text-xs">{account}</p>
      ) : null}

      <div className="mt-auto pt-2">
        {connected ? (
          <form
            action={async () => {
              "use server";
              if (connectionId) {
                if (id === "whatsapp") {
                  const { disconnectOpenWA } = await import("../openwa-actions");
                  await disconnectOpenWA();
                  const { redirect } = await import("next/navigation");
                  redirect("/dashboard/integrations");
                } else {
                  const { disconnectChannel: dc } = await import("../actions");
                  await dc(connectionId);
                }
              }
            }}
          >
            <Button variant="outline" size="sm" className="w-full" type="submit">
              <Unlink className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </form>
        ) : id === "whatsapp" ? (
          <Link href="/dashboard/integrations/whatsapp">
            <Button size="sm" className="w-full">
              <Link2 className="mr-2 h-4 w-4" />
              Connect
            </Button>
          </Link>
        ) : (
          <form action={connectChannel}>
            <input type="hidden" name="channel" value={id} />
            <Button size="sm" className="w-full" type="submit">
              <Link2 className="mr-2 h-4 w-4" />
              Connect
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
