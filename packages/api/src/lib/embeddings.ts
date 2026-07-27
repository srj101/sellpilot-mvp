/**
 * Real image/text embeddings via NVIDIA's hosted NeMo Retriever VL embed model — reachable
 * with a free-tier API key (no self-hosted model, no GPU).
 *
 * NVIDIA's older `nvidia/nvclip` (the original CLIP-based multimodal model) is deprecated
 * as a hosted endpoint — it only ships now as a self-hosted NIM container requiring an
 * RTX-40xx-class GPU, which defeats the point of a hosted API key. `nvidia/llama-nemotron-embed-vl-1b-v2`
 * is the still-actively-hosted replacement, confirmed live against the real API (2026):
 * https://integrate.api.nvidia.com/v1/embeddings
 *
 * This model is asymmetric (query vs passage), unlike CLIP's single shared space:
 * - Images can ONLY be embedded as input_type "passage" — the API rejects "query" for
 *   image input with a 400. So both indexed catalog images AND a customer's search photo
 *   go through the same "passage" pathway — there's no other option for image input.
 * - Text defaults to "query" here (the natural role for a bare text-embedding helper —
 *   nothing in this repo indexes text as a searchable passage today).
 *
 * Both functions throw on failure (bad/missing key, network error, rate limit) rather
 * than swallowing errors — vector-search.ts already wraps every call in try/catch and
 * degrades gracefully (same as the old "ChromaDB offline" behavior), so there's no need
 * to duplicate that handling here.
 */

// Configurable via env so a future NVIDIA model deprecation/rename (like the one that
// retired the original hosted nvclip endpoint) is a config change, not a code deploy.
const NVIDIA_EMBEDDINGS_URL = process.env.NVIDIA_EMBEDDINGS_URL ?? "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL ?? "nvidia/llama-nemotron-embed-vl-1b-v2";

interface NvidiaEmbeddingResponse {
  data: { embedding: number[] }[];
}

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("NVIDIA_API_KEY is not set — image/text embeddings are unavailable.");
  }
  return key;
}

async function embed(input: string, inputType: "query" | "passage"): Promise<number[]> {
  const response = await fetch(NVIDIA_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [input], model: EMBED_MODEL, input_type: inputType }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`NVIDIA embeddings request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const result = (await response.json()) as NvidiaEmbeddingResponse;
  const embedding = result.data[0]?.embedding;
  if (!embedding) {
    throw new Error("NVIDIA embeddings response had no embedding data.");
  }
  return embedding;
}

export async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image for embedding (${imageResponse.status}): ${imageUrl}`);
  }
  const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
  // "passage" is the only input_type the API accepts for images — see file header.
  return embed(dataUri, "passage");
}

export async function getTextEmbedding(text: string): Promise<number[]> {
  return embed(text, "query");
}
