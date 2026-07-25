"use client";

import { cn } from "@acme/ui";

const STEPS = [
  { key: "chat", label: "Business Info" },
  { key: "connect", label: "Connect Channels" },
  { key: "products", label: "Add Products" },
  { key: "trial", label: "Start Trial" },
] as const;

export function OnboardingProgress({
  current,
}: {
  current: (typeof STEPS)[number]["key"];
}) {
  const idx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Step {idx + 1} of {STEPS.length}
      </span>
      <div className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              "h-1.5 w-8 rounded-full transition-colors",
              i <= idx ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}
