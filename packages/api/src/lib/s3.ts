import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
