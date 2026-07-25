import {
  defaultShouldDehydrateQuery,
  QueryClient,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";

/**
 * A member removed from their business mid-session hits this on their very next API call
 * (businessProcedure in packages/api/src/trpc.ts throws this exact FORBIDDEN message when the
 * URL names a real store the caller isn't a member of). Bounce them to the store picker instead
 * of leaving a raw error toast/crash as the only feedback.
 */
function handleForbidden(error: unknown) {
  if (typeof window === "undefined") return;
  if (!(error instanceof TRPCClientError)) return;
  const code = (error.data as { code?: string } | undefined)?.code;
  if (code === "FORBIDDEN" && error.message.includes("don't have access")) {
    window.location.href = "/onboarding/select-business";
  }
}

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({ onError: handleForbidden }),
    mutationCache: new MutationCache({ onError: handleForbidden }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
        shouldRedactErrors: () => {
          // We should not catch Next.js server errors
          // as that's how Next.js detects dynamic pages
          // so we cannot redact them.
          // Next.js also automatically redacts errors for us
          // with better digests.
          return false;
        },
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
