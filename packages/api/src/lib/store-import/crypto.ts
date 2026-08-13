import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@acme/env";

import type { ProviderCredentials } from "./types";

/**
 * AES-256-GCM encryption for stored store-connection credentials.
 *
 * The `credentials` jsonb column holds `{ encrypted: "<base64 iv>:<base64 tag>:<base64 data>" }`
 * so a DB leak never exposes an access token / consumer secret in the clear. Decryption
 * happens only on the API server, inside the router layer, immediately before a fetch.
 *
 * Key source: STORE_CONNECTION_ENCRYPTION_KEY env var. Any string works — we SHA-256 it
 * down to a 32-byte key so an operator can paste a human-readable secret. If the var is
 * missing we refuse to encrypt (fail closed) rather than silently persist plaintext.
 */
function getKey(): Buffer {
  const secret = env.STORE_CONNECTION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "STORE_CONNECTION_ENCRYPTION_KEY is not set — refusing to store store-connection credentials in plaintext.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export interface EncryptedCredentialsPayload {
  /** `${ivB64}:${tagB64}:${dataB64}` */
  encrypted: string;
  version: 1;
}

export function encryptCredentials(credentials: Record<string, string>): EncryptedCredentialsPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`,
    version: 1,
  };
}

export function decryptCredentials(payload: EncryptedCredentialsPayload): ProviderCredentials {
  const [ivB64, tagB64, dataB64] = payload.encrypted.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted credentials payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as ProviderCredentials;
}
