"use client";

import { useState } from "react";
import { Key, Save } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { authClient } from "~/auth/client";

export function PasswordClient() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const showToast = (text: string, error?: boolean) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3500);
  };

  async function handleSave() {
    if (!currentPassword || !newPassword) {
      showToast("Please fill in all fields", true);
      return;
    }
    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters", true);
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New password and confirmation don't match", true);
      return;
    }

    setSaving(true);
    try {
      // better-auth verifies currentPassword server-side and rejects the request if it's wrong.
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if (error) {
        showToast(error.message ?? "Failed to update password", true);
        return;
      }
      showToast("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      showToast(err.message || "Failed to update password", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.error ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"
          }`}
        >
          {toast.text}
        </div>
      )}

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
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pl-10 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-10 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-lg">
              <Save className="h-4 w-4" />
              {saving ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
