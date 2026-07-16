"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Calendar } from "@acme/ui/calendar";
import type { DateRange } from "@acme/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";

function toISODate(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function DateRangePicker({
  from,
  to,
  active,
}: {
  from: string | null;
  to: string | null;
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>(
    from && to ? { from: new Date(from), to: new Date(to) } : undefined,
  );

  function handleSelect(range: DateRange | undefined) {
    setPending(range);
    if (range?.from && range.to) {
      const params = new URLSearchParams();
      params.set("from", toISODate(range.from));
      params.set("to", toISODate(range.to));
      router.push(`/dashboard/analytics?${params.toString()}`);
      setOpen(false);
    }
  }

  const label =
    from && to
      ? `${new Date(from).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(to).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : "Custom range";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={active ? "default" : "outline"} size="sm" className="h-8 gap-1.5 text-xs">
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar mode="range" numberOfMonths={2} selected={pending} onSelect={handleSelect} defaultMonth={pending?.from} />
      </PopoverContent>
    </Popover>
  );
}
