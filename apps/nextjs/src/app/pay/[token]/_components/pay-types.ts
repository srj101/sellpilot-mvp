export interface OrderSummary {
  orderNumber: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  total: number;
  customerName: string;
  customerPhone: string | null;
  shippingAddress: string | null;
  shippingDistrict: string | null;
}

export interface OrderItemSummary {
  id: string;
  name: string;
  variantTitle: string | null;
  qty: number;
  lineTotal: number;
}
