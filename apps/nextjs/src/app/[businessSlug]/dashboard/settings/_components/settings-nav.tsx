import { Bell, Bot, Building2, FileText, HelpCircle, Truck, User } from "lucide-react";

import { cn } from "@acme/ui";

import type { SectionId } from "./types";

const SECTIONS: { id: SectionId; icon: React.ElementType; label: string }[] = [
  { id: "business", icon: Building2, label: "Business Profile" },
  { id: "profile", icon: User, label: "Personal Profile" },
  { id: "notifications", icon: Bell, label: "Notifications" },
  { id: "ai-agent", icon: Bot, label: "AI Agent" },
  { id: "shipping", icon: Truck, label: "Shipping Rates" },
  { id: "faqs", icon: HelpCircle, label: "FAQs" },
  { id: "policies", icon: FileText, label: "Policies" },
];

export function SettingsNav({
  activeSection,
  onSelect,
}: {
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav className="lg:sticky lg:top-0 flex w-full shrink-0 gap-1 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:overflow-visible lg:rounded-xl lg:border lg:bg-card lg:p-1.5">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = activeSection === section.id;
        const cls = cn(
          "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );
        return (
          <button key={section.id} type="button" onClick={() => onSelect(section.id)} className={cls}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
