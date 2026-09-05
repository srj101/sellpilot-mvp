/**
 * The sharp-backed image compressor for conversation media.
 *
 * Deliberately its own module, imported only by the worker and the backfill script and
 * never by anything Next.js traces. sharp is a native module and Next refuses to bundle
 * one from a workspace package ("Package sharp can't be external"); keeping it here means
 * the web image never carries a 30MB platform-specific binary it would never call.
 *
 * Register it with setImageCompressor() at process start — see apps/worker/src/index.ts.
 */
import type { ImageCompressor } from "./media-storage";

/**
 * Chosen by measuring the real stored photos, not by guessing:
 *
 *   jpeg 1600 q82   1264KB -> 950KB   25% saved
 *   jpeg 1280 q78   1264KB -> 585KB   54% saved   <- chosen
 *   jpeg 1280 q72   1264KB -> 507KB   60% saved
 *   webp 1280 q78   1264KB -> 627KB   50% saved
 *
 * The resize does most of the work; 1600px barely helps because Meta has already
 * JPEG-encoded these once. q72 buys another 6% at visible cost, and a merchant squinting
 * at a customer's photo to identify which product they mean is exactly who pays for that.
 *
 * WebP is NOT used, which is counterintuitive enough to record: it is usually the smaller
 * format, but on already-JPEG photographs mozjpeg beat it outright in the measurements
 * above. Worth re-measuring before anyone "improves" this.
 *
 * Voice notes get no equivalent. Messenger and WhatsApp already deliver them as Opus at
 * 14-16KB, close to optimal for speech, and squeezing out a couple more kilobytes would
 * mean an ffmpeg binary in the image for no meaningful gain.
 */
const MAX_EDGE = 1280;
const QUALITY = 78;

/** Below this an image is already small; re-encoding costs CPU for nothing. The
 * never-grow guard makes a low threshold safe. */
const MIN_BYTES = 30 * 1024;

export const compressImageWithSharp: ImageCompressor = async (buffer) => {
  if (buffer.byteLength < MIN_BYTES) return null;

  const sharp = (await import("sharp")).default;

  const output = await sharp(buffer)
    // withoutEnlargement: a small image must never be upscaled into a bigger file.
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();

  // Some images are already better optimised than anything produced here. Keeping a
  // larger "compressed" file would be worse than not compressing at all.
  if (output.byteLength >= buffer.byteLength) return null;

  return { buffer: output, contentType: "image/jpeg" };
};
