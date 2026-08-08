import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import { PaymentMethodClient } from "./payment-method-client";

export default async function PaymentMethodPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { businessSlug } = await params;

  return (
      <div className="space-y-6 pb-10">
        <div>
          <Link href={`/${businessSlug}/dashboard/billing`}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Billing
            </Button>
          </Link>
        </div>

        <div className="mx-auto max-w-md space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Add Payment Method</h1>
          <p className="text-sm text-muted-foreground">Save a card for automatic billing renewals.</p>
        </div>

        <PaymentMethodClient />
      </div>
  );
}
