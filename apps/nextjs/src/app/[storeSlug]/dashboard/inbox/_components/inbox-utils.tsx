import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "../../integrations/_components/integration-icons";

export const CHANNELS = [
  { id: "all", label: "All" },
  { id: "facebook_page", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export function formatCurrency(amount: number) {
  return `৳${Math.round(amount).toLocaleString()}`;
}

export const TAG_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  rose: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  violet: "bg-violet-500/10 text-violet-600 border-violet-500/20",
};

export const STATUS_TABS = [
  { id: "all", label: "All Contacts" },
  { id: "order_requests", label: "Order Requests" },
  { id: "unreplied", label: "Unreplied" },
  { id: "ticket", label: "Tickets" },
  { id: "resolved", label: "Resolved" },
  { id: "archived", label: "Archived" },
] as const;

const AVATAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-cyan-500",
];

export function avatarColor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Compact form for list rows: "5m", "2h", "3d". */
export function formatRelativeTimeShort(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

/** Verbose form for the thread header: "5m ago", "2h ago". */
export function formatRelativeTimeLong(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** Full date + time, used under each message bubble. */
export function formatDetailedTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function channelIcon(platform: string, className: string) {
  switch (platform) {
    case "facebook_page":
      return <FacebookIcon className={className} />;
    case "instagram":
      return <InstagramIcon className={className} />;
    case "whatsapp":
      return <WhatsAppIcon className={className} />;
    default:
      return null;
  }
}

export function channelLabel(platform: string) {
  switch (platform) {
    case "facebook_page":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "whatsapp":
      return "WhatsApp";
    default:
      return "Messages";
  }
}

export function platformBadgeColor(platform: string) {
  switch (platform) {
    case "facebook_page":
      return "bg-[#1877F2] text-white";
    case "instagram":
      return "bg-gradient-to-br from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888] text-white";
    case "whatsapp":
      return "bg-[#25D366] text-white";
    default:
      return "bg-muted-foreground text-white";
  }
}
