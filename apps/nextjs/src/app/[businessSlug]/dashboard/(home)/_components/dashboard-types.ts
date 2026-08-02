import type { ShoppingCart } from "lucide-react";

export interface SerializedOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  customerName: string;
  customerPhone: string | null;
  channel: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  [key: string]: unknown;
}

export interface MessageStats {
  total: number;
  inbound: number;
  outbound: number;
  platformBreakdown: {
    instagram: number;
    whatsapp: number;
    facebook: number;
  };
}

export interface RecentOrderItem {
  orderId: string;
  name: string;
  qty: number;
  lineTotal: number;
  [key: string]: unknown;
}

export interface DashboardClientProps {
  userName: string;
}

export interface ActivityEvent {
  id: string;
  title: string;
  time: number;
  icon: typeof ShoppingCart;
  color: string;
}
