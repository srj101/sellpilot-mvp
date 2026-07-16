export const DAY = 86_400_000;

export function formatCurrency(amount: number) {
  return `৳${Math.round(amount).toLocaleString()}`;
}

export function relativeTime(ms: number, now: number) {
  const diff = now - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const AVATAR_COLORS = ["bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500"];
export function avatarColor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Percentage change vs. a prior-period baseline. Returns null (no badge) when there's no baseline to compare against — a fabricated "+100%" from a zero baseline is misleading, not informative. */
export function trendPct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export const STATUS_BADGE: Record<string, "success" | "destructive" | "secondary" | "default"> = {
  delivered: "success",
  cancelled: "destructive",
  returned: "destructive",
};
