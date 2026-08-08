import { headers } from "next/headers";
import { DashboardShell } from "./(home)/_components/dashboard-shell";

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

  return <DashboardShell>{children}</DashboardShell>;
}
