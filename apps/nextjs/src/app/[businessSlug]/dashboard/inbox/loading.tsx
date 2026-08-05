import { Skeleton } from "@acme/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm">
      {/* Tabs bar skeleton */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2 md:px-4 md:py-2.5">
        <div className="hidden gap-1 md:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid h-full w-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        {/* Left: Conversation list skeleton */}
        <div className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r">
          <div className="p-4 pb-3">
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 border-b px-4 py-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Messages skeleton */}
        <div className="flex min-h-0 flex-col">
          {/* Header skeleton */}
          <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>

          {/* Messages skeleton */}
          <div className="flex-1 space-y-4 p-6">
            {/* Inbound message */}
            <div className="flex max-w-[75%]">
              <div className="space-y-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>

            {/* Outbound message */}
            <div className="ml-auto flex max-w-[75%]">
              <div className="space-y-1.5 rounded-2xl rounded-br-md bg-primary/10 px-4 py-3">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>

            {/* Inbound message */}
            <div className="flex max-w-[75%]">
              <div className="space-y-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                <Skeleton className="h-4 w-40" />
              </div>
            </div>

            {/* Outbound message */}
            <div className="ml-auto flex max-w-[75%]">
              <div className="space-y-1.5 rounded-2xl rounded-br-md bg-primary/10 px-4 py-3">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          </div>

          {/* Reply form skeleton */}
          <div className="shrink-0 border-t p-4">
            <div className="flex items-end gap-2">
              <Skeleton className="h-11 flex-1 rounded-full" />
              <Skeleton className="h-11 w-11 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
