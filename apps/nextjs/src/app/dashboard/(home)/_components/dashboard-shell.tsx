import { getSession } from "~/auth/server";
import { FloatingHeader } from "./floating-header";
import { Sidebar } from "./sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export async function DashboardShell({ children }: DashboardShellProps) {
  const session = await getSession();
  const user = session
    ? { name: session.user.name, email: session.user.email, image: session.user.image ?? null }
    : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <FloatingHeader user={user} />
        <main className="haze-scrollbar-dark flex-1 overflow-y-auto pt-24 md:pt-6">
          <div className="h-full px-4 md:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <div className="fixed bottom-4 right-10 z-50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/30 md:right-6">
        SELLPILOT MVP
      </div>
    </div>
  );
}

