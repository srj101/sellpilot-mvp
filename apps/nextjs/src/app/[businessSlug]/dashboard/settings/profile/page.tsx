import { redirect } from "next/navigation";
import { User, Mail, Phone, Save } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your personal info and contact details.</p>
        </div>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your display credentials and profile photo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 border-b pb-4">
              <span className="h-14 w-14 flex items-center justify-center rounded-full bg-primary text-white font-bold text-lg">
                {session.user.name?.[0]?.toUpperCase() ?? "U"}
              </span>
              <div>
                <Button size="sm" variant="outline" className="rounded-lg">
                  Change Avatar
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1">Recommended size 256x256. Max 2MB.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="name" defaultValue={session.user.name ?? ""} className="pl-10 rounded-lg" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" defaultValue={session.user.email ?? ""} className="pl-10 rounded-lg" disabled />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Support Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="phone" placeholder="e.g. +8801700000000" className="pl-10 rounded-lg" />
              </div>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <Button className="gap-2 rounded-lg">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
