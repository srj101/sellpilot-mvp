# Visual product search

How a customer's photo finds a product.

## The embedder is multimodal, and that is the point

`packages/api/src/lib/embeddings.ts` uses NVIDIA's hosted NeMo Retriever VL embed
model (`nvidia/llama-nemotron-embed-vl-1b-v2`). It embeds images and text into the
same model, so a customer's photo is compared against catalog photos in real
visual space — one API call per image, no intermediate text description.

**OpenAI is not an option here.** Its `text-embedding-3-*` models are text-only
and it ships no image-embedding endpoint. The nearest OpenAI-only equivalent is
describe-then-embed: caption each image with a vision model, embed the caption.
That was measured at ~7.9s per image versus one call, costs two billed requests,
and downgrades pixel-level similarity to semantic similarity — it finds *a* red
zari saree rather than *this* one. Multimodal is the right tool for "find the
product in this photo", which is what `dm-reply.ts` needs when a customer sends
one.

NVIDIA's older `nvidia/nvclip` is deprecated as a hosted endpoint — it now ships
only as a self-hosted NIM container needing an RTX-40xx-class GPU. The NeMo
Retriever VL model is the actively hosted replacement, still free-tier.

## The model is asymmetric

Unlike CLIP's single shared space, this model distinguishes `input_type`:

- **Images can only be `"passage"`.** The API rejects `"query"` for image input
  with a 400. So both indexed catalog images and a customer's search photo go
  through the same `"passage"` path — there is no alternative for image input.
- **Text defaults to `"query"`**, the natural role for a bare text-embedding
  helper.

`getTextEmbedding` is currently unused. Because of the asymmetry above, wiring it
up for text-against-image search is not a free win — a `"query"` text vector and a
`"passage"` image vector sit in related but deliberately different spaces, so it
would need testing on real data before being trusted.

## The 2048 dimensions are load-bearing

`product_image_embedding.embedding` is `vector(2048)`, matching this model's
output. Changing `NVIDIA_EMBED_MODEL` to anything with a different width requires
a schema migration as well as a re-index.

## Re-indexing

Changing `NVIDIA_EMBED_MODEL` changes the vector space. Old rows are not
"slightly stale", they are meaningless relative to new ones — and because cosine
distance still returns a number, nothing errors. Search just quietly gets worse.

**`/api/cron/sync-images` will not do this for you.** It indexes only images with
no existing row, so a stale embedding is skipped, not replaced. Delete first:

```bash
psql "$POSTGRES_URL" -c "SELECT count(*) FROM product_image_embedding;"
psql "$POSTGRES_URL" -c "DELETE FROM product_image_embedding;"
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-images
```

Run the delete and the rebuild back to back. In between, a customer photo returns
no match — `searchProductsByImage` degrades to an empty result rather than
failing, so the agent answers without the product hint.

## Failure behaviour

`embeddings.ts` throws on a missing key, network error or rate limit;
`vector-search.ts` wraps every call in try/catch and degrades to "no matches".
That is deliberate — a missing product hint is recoverable, a failed customer
reply is not. Without `NVIDIA_API_KEY` set, image indexing and image search no-op
rather than erroring.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `NVIDIA_API_KEY` | — | optional; unset means image search no-ops |
| `NVIDIA_EMBEDDINGS_URL` | `https://integrate.api.nvidia.com/v1/embeddings` | env-configurable so a model rename is config, not a deploy |
| `NVIDIA_EMBED_MODEL` | `nvidia/llama-nemotron-embed-vl-1b-v2` | changing it requires a re-index, and a migration if the width differs |
