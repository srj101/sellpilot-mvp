import {
  Bell,
  ShoppingBag,
  Wallet,
  Truck,
  MessageCircleWarning,
  PackageX,
} from "lucide-react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export const NOTIFICATION_TYPE_ICON: Record<string, typeof Bell> = {
  order_created: ShoppingBag,
  payment_received: Wallet,
  cod_confirmed: Truck,
  abandoned_followup_sent: MessageCircleWarning,
  low_stock: PackageX,
};

export function formatNotificationTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
