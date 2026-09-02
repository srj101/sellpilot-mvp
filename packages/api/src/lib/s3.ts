import { createHash } from "node:crypto";

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@acme/env";

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  // Credentials are only set explicitly when both are present. Unset falls through
  // to the SDK's default chain (task role, instance profile), which is how this
  // should run on ECS/EC2. The previous "mock-key" fallback was LocalStack-era
  // scaffolding that turned a missing credential into an opaque SignatureDoesNotMatch
  // instead of letting the role be discovered.
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

export const BUCKET_NAME = env.AWS_S3_BUCKET;

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 900 });
}

export async function getS3ObjectSize(key: string): Promise<number> {
  try {
    const command = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const response = await s3Client.send(command);
    return response.ContentLength ?? 0;
  } catch (error) {
    console.error("[S3] Failed to fetch object size:", key, error);
    return 0;
  }
}

export async function deleteS3Object(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    await s3Client.send(command);
  } catch (error) {
    console.error("[S3] Failed to delete object:", key, error);
  }
}

/** Stable, derivable key for a contact's avatar. Deliberately not the random UUID
 * processImageUrl generates: a refresh must overwrite the same object, or every sync cycle
 * would leave the previous avatar orphaned in the bucket forever. */
export function contactAvatarKey(businessId: string, platform: string, psid: string): string {
  return `avatars/${businessId}/${platform}/${psid}.jpg`;
}

export interface UploadedAvatar {
  key: string;
  hash: string;
  /** False when the bytes matched `previousHash`, meaning nothing was written to S3. */
  changed: boolean;
}

/**
 * Download a contact's profile picture and store it under a stable key.
 *
 * `previousHash` is what makes refreshes cheap. Meta signs profile_pic URLs, so the URL is
 * different on every call even when the photo has not changed — comparing URLs can never
 * detect "unchanged". Hashing the bytes can, which stops a weekly refresh from rewriting
 * every avatar in the bucket.
 *
 * Cache-Control is a day: the key is stable, so a changed photo takes up to that long to
 * appear. Invisible for profile pictures, and it keeps repeat inbox loads off S3 egress.
 */
export async function uploadContactAvatar(params: {
  businessId: string;
  platform: string;
  psid: string;
  imageUrl: string;
  previousHash?: string | null;
}): Promise<UploadedAvatar | null> {
  const res = await fetch(params.imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch avatar (${res.status}) for ${params.platform}:${params.psid}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength === 0) {
    return null;
  }

  const hash = createHash("sha256").update(buffer).digest("hex");
  const key = contactAvatarKey(params.businessId, params.platform, params.psid);

  if (params.previousHash && params.previousHash === hash) {
    return { key, hash, changed: false };
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: res.headers.get("content-type") ?? "image/jpeg",
      CacheControl: "public, max-age=86400",
    }),
  );

  return { key, hash, changed: true };
}

/**
 * Remove every stored avatar for a business.
 *
 * The meta_contact rows go on their own via the business FK cascade, but S3 objects have
 * no such relationship — without this they would outlive the business indefinitely, which
 * is the wrong answer for photographs of someone else's customers. Called from the store
 * deletion path; deliberately not called on disconnect, where history is meant to survive.
 */
export async function deleteBusinessAvatars(businessId: string): Promise<number> {
  const prefix = `avatars/${businessId}/`;
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
    if (keys.length > 0) {
      // DeleteObjects caps at 1000 per call, which matches ListObjectsV2's page size.
      await s3Client.send(
        new DeleteObjectsCommand({ Bucket: BUCKET_NAME, Delete: { Objects: keys } }),
      );
      deleted += keys.length;
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

export function getPublicUrl(key: string): string {
  return `https://${BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Downloads an image from any source (HTTP URL, data URL, or base64 string),
 * uploads it to S3, and returns the public S3 URL.
 *
 * - If the URL is already pointing to our S3 bucket, returns it as-is.
 * - If it's a data URL (data:image/...;base64,...), extracts the buffer.
 * - If it's an HTTP(S) URL, fetches the image.
 *
 * Returns null if the input is empty/undefined.
 */
export async function processImageUrl(
  imageUrl: string | undefined | null,
  businessId: string,
  prefix: string = "products",
): Promise<string | null> {
  if (!imageUrl?.trim()) return null;

  const trimmed = imageUrl.trim();

  // Already an S3 URL from our bucket — skip re-upload
  const bucketUrl = getPublicUrl("");
  if (trimmed.startsWith(bucketUrl)) {
    return trimmed;
  }

  let buffer: Buffer;
  let contentType: string;
  let ext: string;

  if (trimmed.startsWith("data:")) {
    // Data URL: data:image/jpeg;base64,... or data:image/png;base64,...
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
    if (!match?.[1] || !match?.[2]) throw new Error("Invalid data URL format");
    contentType = match[1];
    buffer = Buffer.from(match[2], "base64");
    ext = contentType.split("/")[1] ?? "jpg";
  } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    // External HTTP(S) URL — fetch it
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`Failed to fetch image from URL (${res.status}): ${trimmed}`);
    contentType = res.headers.get("content-type") ?? "image/jpeg";
    buffer = Buffer.from(await res.arrayBuffer());
    ext = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
  } else {
    throw new Error(`Unsupported image URL format: ${trimmed.slice(0, 50)}`);
  }

  // Upload to S3
  const key = `${prefix}/${businessId}/${crypto.randomUUID()}.${ext}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return getPublicUrl(key);
}
