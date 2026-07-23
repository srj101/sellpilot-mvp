import { redirect } from "next/navigation";
import { ShieldAlert, Key, Save } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

export default async function PasswordSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security & Password</h1>
          <p className="text-muted-foreground mt-1 text-sm">Update your password credentials and account security settings.</p>
        </div>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Ensure your account is using a long, random password to stay secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="current-password" type="password" className="pl-10 rounded-lg" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="new-password" type="password" className="pl-10 rounded-lg" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="confirm-password" type="password" className="pl-10 rounded-lg" />
              </div>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <Button className="gap-2 rounded-lg">
                <Save className="h-4 w-4" />
                Update Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
