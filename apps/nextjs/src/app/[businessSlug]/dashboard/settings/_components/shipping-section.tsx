import { MapPin, Plus, Trash2, Truck } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

import { SectionCard } from "./section-card";
import type { ShippingRate } from "./types";

export function ShippingSection({
  shippingRates,
  isOwner,
  deleting,
  onCreate,
  onDelete,
}: {
  shippingRates: ShippingRate[];
  isOwner: boolean;
  deleting: boolean;
  onCreate: () => void;
  onDelete: (rate: ShippingRate) => void;
}) {
  return (
    <SectionCard
      icon={Truck}
      title="Shipping Rates"
      description={`${shippingRates.length} district rates configured. The AI uses these to calculate shipping.`}
      action={
        isOwner ? (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
        ) : undefined
      }
    >
      {shippingRates.length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>District</span>
            <span className="w-16">Cost</span>
            <span className="w-20">Est. Days</span>
            <span className="w-20">Status</span>
            {isOwner ? <span className="w-8" /> : null}
          </div>
          {shippingRates.map((rate) => (
            <div
              key={rate.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 rounded-lg bg-muted/30 px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {rate.district}
              </span>
              <span className="w-16 tabular-nums">৳{rate.cost}</span>
              <span className="w-20 text-muted-foreground">
                {rate.estimatedDays ? `${rate.estimatedDays} days` : "—"}
              </span>
              <span className="w-20">
                <Badge variant={rate.active ? "success" : "secondary"} className="w-fit text-[10px]">
                  {rate.active ? "Active" : "Inactive"}
                </Badge>
              </span>
              {isOwner ? (
                <span className="w-8">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(rate)}
                    disabled={deleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No shipping rates configured yet.
        </p>
      )}
    </SectionCard>
  );
}
