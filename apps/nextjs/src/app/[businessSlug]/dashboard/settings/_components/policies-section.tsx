import { FileText, Plus, Trash2 } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

import { SectionCard } from "./section-card";
import type { Policy } from "./types";

export function PoliciesSection({
  policies,
  isOwner,
  deleting,
  onCreate,
  onDelete,
}: {
  policies: Policy[];
  isOwner: boolean;
  deleting: boolean;
  onCreate: () => void;
  onDelete: (policy: Policy) => void;
}) {
  return (
    <SectionCard
      icon={FileText}
      title="Policies"
      description={`${policies.length} store policies. These give the AI context about your return, shipping, and warranty rules.`}
      action={
        isOwner ? (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
        ) : undefined
      }
    >
      {policies.length > 0 ? (
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="group relative rounded-lg bg-muted/30 p-4 pr-10">
              <div className="flex items-center gap-2">
                <Badge variant={p.active ? "default" : "secondary"} className="text-[10px] capitalize">
                  {p.type}
                </Badge>
                <h4 className="text-sm font-semibold text-foreground">
                  {p.title}
                </h4>
                {!p.active && (
                  <Badge variant="destructive" className="text-[10px]">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                {p.body}
              </p>
              {isOwner ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => onDelete(p)}
                  disabled={deleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No policies configured yet.
        </p>
      )}
    </SectionCard>
  );
}
