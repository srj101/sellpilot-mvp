"use client";

import { useParams } from "next/navigation";

/** The active store's slug from the current /{businessSlug}/dashboard/* URL. */
export function useBusinessSlug() {
  const params = useParams<{ businessSlug: string }>();
  return params.businessSlug;
}
