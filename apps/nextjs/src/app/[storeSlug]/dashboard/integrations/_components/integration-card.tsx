import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";

import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "./integration-icons";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  whatsapp: WhatsAppIcon,
};

const GRADIENTS: Record<string, string> = {
  facebook: "from-[#0668E1] via-[#1877F2] to-[#0a2f6b]",
  instagram: "from-[#4F5BD5] via-[#D62976] to-[#962fbf]",
  whatsapp: "from-[#25D366] via-[#128C7E] to-[#064c40]",
};

const ROUTES: Record<string, string> = {
  facebook: "integrations/facebook",
  instagram: "integrations/instagram",
  whatsapp: "integrations/whatsapp",
};

export interface IntegrationCardProps {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  account?: string | null;
  storeSlug: string;
  isOwner: boolean;
}

export function IntegrationCard({
  id,
  name,
  description,
  connected,
  account,
  storeSlug,
  isOwner,
}: IntegrationCardProps) {
  const Icon = ICONS[id] ?? FacebookIcon;
  const gradient = GRADIENTS[id] ?? "from-primary to-primary/60";
  const href = `/${storeSlug}/dashboard/${ROUTES[id] ?? "integrations"}`;

  const cardBody = (
    <>
      {/* Brand gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />

      {/* Watermark icon */}
      <Icon className="absolute -top-4 -right-4 h-24 w-24 rotate-12 text-white/10" />

      {/* Centered brand icon */}
      <div className="absolute inset-0 flex items-center justify-center pb-14">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
          <Icon className="h-10 w-10 text-white" />
        </div>
      </div>

      {/* Bottom scrim for text legibility */}
      <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex flex-col gap-1.5 p-3.5 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">{name}</span>
          {connected ? (
            <BadgeCheck className="h-3.5 w-3.5 fill-white/20 text-white" />
          ) : null}
        </div>

        <p className="line-clamp-1 text-xs leading-snug text-white/75">
          {description}
        </p>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-white/65">
            {connected ? (account ?? "Connected") : "Not connected"}
          </span>
          {isOwner ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black shadow transition-transform duration-200 group-hover:scale-105">
              Go
              <ArrowUpRight className="h-3 w-3" />
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white/80">
              View only
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (!isOwner) {
    return (
      <div className="group relative flex h-64 w-full flex-col justify-end overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 opacity-80 cursor-default">
        {cardBody}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group relative flex h-64 w-full flex-col justify-end overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
    >
      {cardBody}
    </Link>
  );
}
