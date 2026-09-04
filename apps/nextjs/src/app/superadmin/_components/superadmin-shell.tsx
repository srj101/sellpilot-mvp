"use client";

import type { SuperadminTab } from "./superadmin-sidebar";
import { SuperadminHeader } from "./superadmin-header";
import { SuperadminSidebar } from "./superadmin-sidebar";

export function SuperadminShell({
  activeTab,
  onSelectTab,
  user,
  children,
}: {
  activeTab: SuperadminTab;
  onSelectTab: (tab: SuperadminTab) => void;
  user?: { name: string; email: string; image?: string | null } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="text-foreground bg-background flex h-screen w-screen overflow-hidden">
      <SuperadminSidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        user={user}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SuperadminHeader activeTab={activeTab} user={user} />
        <main className="haze-scrollbar-dark flex h-0 flex-1 flex-col overflow-y-auto pt-16 md:pt-4">
          <div className="w-full flex-1 px-4 pb-16 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <div className="text-muted-foreground/30 pointer-events-none fixed right-6 bottom-6 z-50 text-[10px] font-semibold tracking-wider uppercase select-none">
        SELLPILOT SUPERADMIN
      </div>
    </div>
  );
}
