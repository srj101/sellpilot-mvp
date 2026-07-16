import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { createCaller } from "~/trpc/caller";
import { PayClient } from "./_components/pay-client";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await params;
  const { status } = await searchParams;

  const caller = await createCaller(await headers());

  let data;
  try {
    data = await caller.checkout.getOrderByToken({ token });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  return (
    <PayClient
      token={token}
      businessName={data.businessName}
      order={data.order}
      items={data.items}
      pageViewId={data.pageViewId}
      sslcommerzConfigured={data.sslcommerzConfigured}
      initialStatus={status ?? null}
    />
  );
}
