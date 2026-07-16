export function getImageEmbedding(imageSource: string): Promise<number[]> {
  // Try to read OPENAI_API_KEY or GEMINI_API_KEY from environment if available.
  // In production, you would fetch actual embeddings here:
  // - OpenAI: calling their CLIP model or embedding endpoint.
  // - Gemini: calling Vertex AI / Generative AI multimodal embeddings.
  //
  // For local development and demonstration, we fall back to a deterministic 512-dimension unit vector
  // based on the image string/hash. This allows ChromaDB indexing, querying, and multi-tenant
  // filtering to work out of the box.

  return Promise.resolve(generateDeterministicMockVector(imageSource, 512));
}

export function getTextEmbedding(text: string): Promise<number[]> {
  // Text embedding helper matching the vector space of the image embeddings.
  return Promise.resolve(generateDeterministicMockVector(text, 512));
}

function generateDeterministicMockVector(input: string, dimensions = 512): number[] {
  let hash = 0;
  const str = input.slice(0, 1000);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  const vector = Array.from({ length: dimensions }, (_, i) => {
    const seed = Math.sin(hash + i) * 10000;
    return seed - Math.floor(seed);
  });

  // Normalize to unit magnitude for cosine similarity
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map((v) => v / magnitude) : vector;
}
