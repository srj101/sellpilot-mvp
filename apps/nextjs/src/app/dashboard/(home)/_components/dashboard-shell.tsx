import { Sidebar } from "./sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row md:overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background px-4 pb-6 pt-24 md:px-8 md:pb-8 md:pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
