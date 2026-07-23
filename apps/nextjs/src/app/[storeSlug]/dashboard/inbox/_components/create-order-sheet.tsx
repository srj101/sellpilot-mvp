"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@acme/ui/sheet";
import { toast } from "@acme/ui/toast";
import { useTRPC } from "~/trpc/react";
import { formatCurrency } from "./inbox-utils";

const inputClass = "flex h-9 w-full rounded-md border bg-background px-3 text-sm";

export function CreateOrderSheet({
  threadId,
  defaultName,
  defaultPhone,
  defaultAddress,
  defaultDistrict,
}: {
  threadId: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultAddress?: string;
  defaultDistrict?: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [district, setDistrict] = useState(defaultDistrict ?? "");
  const [offerCode, setOfferCode] = useState("");

  const { data: productData } = useQuery({ ...trpc.products.list.queryOptions(), enabled: open });
  const products = (productData?.products ?? []).filter((p) => p.status === "active");
  const variants = useMemo(
    () => (productData?.variants ?? []).filter((v) => v.productId === productId),
    [productData, productId],
  );

  const { data: quote } = useQuery({
    ...trpc.orders.quote.queryOptions({
      productId,
      variantId: variantId || undefined,
      quantity,
      district: district || undefined,
      offerCode: offerCode || undefined,
    }),
    enabled: open && Boolean(productId) && quantity > 0,
  });

  const createOrder = useMutation(trpc.orders.create.mutationOptions());

  function reset() {
    setProductId("");
    setVariantId("");
    setQuantity(1);
    setOfferCode("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !customerName.trim() || !phone.trim() || !address.trim()) {
      toast.error("Product, customer name, phone, and address are required");
      return;
    }
    createOrder.mutate(
      {
        threadId,
        productId,
        variantId: variantId || undefined,
        quantity,
        customerName: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        district: district || undefined,
        offerCode: offerCode || undefined,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(`Order ${result.orderNumber} created`);
            setOpen(false);
            reset();
            router.refresh();
          } else {
            toast.error(result.error ?? "Failed to create order");
          }
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Create Orders
        </Button>
      </SheetTrigger>
      <SheetContent side="right" scrollBody className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create Order</SheetTitle>
          <SheetDescription>Place an order for this conversation, same as the AI would during checkout.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Product</label>
            <select className={inputClass} value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(""); }}>
              <option value="">Select a product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          {variants.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Variant</label>
              <select className={inputClass} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">Default</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} — {formatCurrency(v.price)} ({v.inventoryQuantity} in stock)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quantity</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Customer Name</label>
              <input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Delivery Address</label>
            <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">District</label>
              <input className={inputClass} value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Offer Code (optional)</label>
              <input className={inputClass} value={offerCode} onChange={(e) => setOfferCode(e.target.value.toUpperCase())} />
            </div>
          </div>

          {quote && productId && (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
              {quote.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-{formatCurrency(quote.discountAmount)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{formatCurrency(quote.shippingCost)}</span></div>
              <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
              {"error" in quote && quote.error && <p className="text-rose-500">{quote.error}</p>}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={createOrder.isPending}>
            {createOrder.isPending ? "Creating..." : "Create Order"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
