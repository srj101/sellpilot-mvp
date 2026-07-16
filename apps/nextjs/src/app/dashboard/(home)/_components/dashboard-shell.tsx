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
    <div className="flex h-dvh flex-col overflow-hidden md:h-screen md:flex-row">
      <Sidebar />
      <FloatingHeader user={user} />
      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-6 pt-24  md:pb-4 md:pt-16">
        <div className="mx-auto h-full">{children}</div>
      </main>
      <div className="fixed bottom-0  right-10 z-50  text-xs text-muted-foreground opacity-30 md:right-4 md:bottom-4">
        SELLPILOT MVP
      </div>
    </div >
  );
}
