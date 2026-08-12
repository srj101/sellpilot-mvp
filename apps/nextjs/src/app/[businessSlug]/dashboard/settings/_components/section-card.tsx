import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";

export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-hover gap-3">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="mt-0.5 text-sm">{description}</CardDescription>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="">{children}</CardContent>
    </Card>
  );
}
