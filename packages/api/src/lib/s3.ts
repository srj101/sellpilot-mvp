import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "mock-key",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "mock-secret",
  },
  ...(process.env.AWS_ENDPOINT_URL ? {
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: true,
  } : {}),
});

export const BUCKET_NAME = process.env.AWS_S3_BUCKET ?? "sellpilot-media";

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  // Ensure the bucket exists locally in development (LocalStack)
  if (process.env.AWS_ENDPOINT_URL) {
    const { CreateBucketCommand, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (e: any) {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      } catch (err) {
        console.error("[S3] Failed to auto-create bucket", err);
      }
    }
  }

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
  if (process.env.AWS_ENDPOINT_URL) {
    return `${process.env.AWS_ENDPOINT_URL}/${BUCKET_NAME}/${key}`;
  }
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;
}
