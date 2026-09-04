import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { ReportForm } from "./_components/report-form";

export default async function ReportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Report a Problem</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Something not working? Tell us here and we'll look into it.
        </p>
      </div>
      <ReportForm />
    </div>
  );
}
