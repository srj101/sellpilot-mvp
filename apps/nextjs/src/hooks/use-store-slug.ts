"use client";

import { useParams } from "next/navigation";

/** The active store's slug from the current /{storeSlug}/dashboard/* URL. */
export function useStoreSlug() {
  const params = useParams<{ storeSlug: string }>();
  return params.storeSlug;
}
