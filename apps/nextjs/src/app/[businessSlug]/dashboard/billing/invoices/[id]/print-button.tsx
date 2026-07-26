"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

import { Button } from "@acme/ui/button";

export function PrintButton() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") === "true") window.print();
  }, [searchParams]);

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print / Save as PDF
    </Button>
  );
}
