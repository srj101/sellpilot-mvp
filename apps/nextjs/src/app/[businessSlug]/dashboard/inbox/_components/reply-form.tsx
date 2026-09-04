"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, Send, X } from "lucide-react";

import { useTRPC } from "~/trpc/react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ReplyForm({
  threadId,
  platform,
  accountId,
  recipientId,
}: {
  threadId: string;
  platform: "facebook_page" | "instagram" | "whatsapp";
  accountId: string;
  recipientId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendReply = useMutation(trpc.inbox.sendReply.mutationOptions());
  const getUploadUrl = useMutation(trpc.inbox.getReplyImageUploadUrl.mutationOptions());

  function pickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 5MB — please pick a smaller one.");
      return;
    }
    setImage({ file, preview: URL.createObjectURL(file) });
  }

  function clearImage() {
    if (image) URL.revokeObjectURL(image.preview);
    setImage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    // An image alone is a complete message — a photo of a product needs no caption.
    if (!trimmed && !image) return;

    setError(null);
    setUploading(true);
    try {
      let imageKey: string | undefined;
      if (image) {
        // Presigned PUT straight to S3; the file never passes through our API.
        const { uploadUrl, key } = await getUploadUrl.mutateAsync({ contentType: image.file.type });
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: image.file,
          headers: { "Content-Type": image.file.type },
        });
        if (!put.ok) {
          // Stop rather than silently sending a bare caption — the customer would get a
          // message referring to a photo that never arrived.
          setError("The image didn't upload. Nothing was sent — please try again.");
          return;
        }
        imageKey = key;
      }

      const result = await sendReply.mutateAsync({
        threadId,
        platform,
        accountId,
        recipientId,
        message: trimmed,
        imageKey,
      });

      if (result.ok) {
        setMessage("");
        clearImage();
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that — please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
    }
  }

  const busy = uploading || sendReply.isPending;
  const canSend = Boolean(message.trim() || image);

  return (
    <div className="space-y-1.5">
      {error && <p className="px-1 text-xs text-rose-600">{error}</p>}
      {sendReply.data && !sendReply.data.ok && (
        <p className="px-1 text-xs text-rose-600">{sendReply.data.reason}</p>
      )}

      {image && (
        <div className="relative inline-block px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.preview}
            alt="Image to send"
            className="max-h-28 rounded-lg border object-contain"
          />
          <button
            type="button"
            onClick={clearImage}
            aria-label="Remove image"
            className="absolute -top-2 right-0 rounded-full border bg-background p-1 shadow"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted"
          title="Attach an image"
        >
          <ImagePlus className="h-4 w-4" />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              pickImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={image ? "Add a caption (optional)..." : "Type a message..."}
          className="min-h-[44px] flex-1 resize-none rounded-full border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />

        <button
          type="submit"
          disabled={busy || !canSend}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-105"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
