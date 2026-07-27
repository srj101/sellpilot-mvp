"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { User, Mail, Save, UploadCloud, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { useTRPC } from "~/trpc/react";
import { authClient } from "~/auth/client";

export function ProfileClient({
  initialName,
  initialEmail,
  initialImage,
}: {
  initialName: string;
  initialEmail: string;
  initialImage: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const getUploadUrl = useMutation(trpc.business.getUploadUrl.mutationOptions());

  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file");
      return;
    }

    setUploading(true);
    try {
      const res = await getUploadUrl.mutateAsync({ contentType: file.type });
      const uploadRes = await fetch(res.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Failed to write image data to storage");
      setImage(res.publicUrl);
    } catch (err: any) {
      showToast(err.message || "Error uploading image");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      showToast("Display name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      // better-auth client methods return { data, error } rather than throwing — checking
      // .error explicitly, not just relying on catch, since a rejected update otherwise
      // still hits the try block's happy path and would report false success.
      const { error } = await authClient.updateUser({ name: name.trim(), image: image ?? undefined });
      if (error) {
        showToast(error.message ?? "Failed to update profile");
        return;
      }
      showToast("Profile updated successfully!");
      router.refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg">
          {toast}
        </div>
      )}

      <Card className="card-hover">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your display credentials and profile photo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 border-b pb-4">
            <div className="relative group h-14 w-14 shrink-0 overflow-hidden rounded-full bg-primary text-white font-bold text-lg flex items-center justify-center">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span>{name?.[0]?.toUpperCase() ?? "U"}</span>
              )}
              <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <UploadCloud className="h-4 w-4 text-white" />
                )}
                <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} className="hidden" />
              </label>
            </div>
            <div>
              <Button size="sm" variant="outline" className="rounded-lg" disabled={uploading} asChild>
                <label className="cursor-pointer">
                  {uploading ? "Uploading..." : "Change Avatar"}
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} className="hidden" />
                </label>
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">Recommended size 256x256. Max 2MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="pl-10 rounded-lg" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" defaultValue={initialEmail} className="pl-10 rounded-lg" disabled />
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-lg">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
