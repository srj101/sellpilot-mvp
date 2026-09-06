"use client";

import { usePathname } from "next/navigation";

import type { SuperadminTab } from "./superadmin-sidebar";
import { SuperadminHeader } from "./superadmin-header";
import { SuperadminSidebar } from "./superadmin-sidebar";

function getActiveTabFromPathname(pathname: string | null): SuperadminTab {
  if (!pathname) return "today";
  if (pathname.includes("/superadmin/today")) return "today";
  if (pathname.includes("/superadmin/overview")) return "overview";
  if (pathname.includes("/superadmin/economics")) return "economics";
  if (pathname.includes("/superadmin/stores")) return "stores";
  if (
    pathname.includes("/superadmin/health") ||
    pathname.includes("/superadmin/ai") ||
    pathname.includes("/superadmin/queues") ||
    pathname.includes("/superadmin/channels")
  ) {
    return "health";
  }
  if (
    pathname.includes("/superadmin/support") ||
    pathname.includes("/superadmin/bugs") ||
    pathname.includes("/superadmin/broadcasts")
  ) {
    return "support";
  }
  if (
    pathname.includes("/superadmin/access") ||
    pathname.includes("/superadmin/users") ||
    pathname.includes("/superadmin/audit")
  ) {
    return "access";
  }
  return "today";
}

export function SuperadminShell({
  activeTab: controlledActiveTab,
  onSelectTab,
  user,
  children,
}: {
  activeTab?: SuperadminTab;
  onSelectTab?: (tab: SuperadminTab) => void;
  user?: { name: string; email: string; image?: string | null } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeTab = controlledActiveTab ?? getActiveTabFromPathname(pathname);
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
