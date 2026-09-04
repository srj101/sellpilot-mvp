import { headers } from "next/headers";
import { DashboardShell } from "./(home)/_components/dashboard-shell";
import { ReportProblemTrigger } from "./_components/report-problem-trigger";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  // The locked page is a standalone full-screen page that should not show the sidebar/header
  if (pathname.endsWith("/dashboard/locked")) {
    return <>{children}</>;
  }

  return (
    <DashboardShell>
      {children}
      {/* Mounted at the layout so it is present on every dashboard page — reporting from
          where the bug is captures the page and, in the Inbox, the conversation. */}
      <ReportProblemTrigger />
    </DashboardShell>
  );
}
