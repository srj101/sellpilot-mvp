import { HelpCircle, Plus, Trash2 } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

import { SectionCard } from "./section-card";
import type { FAQ } from "./types";

export function FaqsSection({
  faqs,
  isOwner,
  deleting,
  onCreate,
  onDelete,
}: {
  faqs: FAQ[];
  isOwner: boolean;
  deleting: boolean;
  onCreate: () => void;
  onDelete: (faq: FAQ) => void;
}) {
  return (
    <SectionCard
      icon={HelpCircle}
      title="FAQs"
      description={`${faqs.length} frequently asked questions. The AI agent uses these to answer customer queries.`}
      action={
        isOwner ? (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
        ) : undefined
      }
    >
      {faqs.length > 0 ? (
        <div className="space-y-3">
          {faqs.map((f) => (
            <div key={f.id} className="group relative rounded-lg bg-muted/30 p-4 pr-10">
              <p className="text-sm font-semibold text-foreground">
                Q: {f.question}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A: {f.answer}
              </p>
              {f.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {isOwner ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => onDelete(f)}
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
          No FAQs configured yet.
        </p>
      )}
    </SectionCard>
  );
}
