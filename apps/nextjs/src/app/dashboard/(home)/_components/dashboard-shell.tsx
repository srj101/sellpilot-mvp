import { Sidebar } from "./sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:h-screen md:flex-row">
      <Sidebar />
      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-6 pt-24 md:px-8 md:pb-8 md:pt-8">
        <div className="mx-auto h-full">{children}</div>
      </main>
    </div>
  );
}
