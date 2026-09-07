# Prompt caching

How SellPilot uses OpenAI's automatic prompt caching, and why each of the six LLM
call sites is wired the way it is — three carry a `prompt_cache_key`, three
deliberately don't.

## It's automatic — there's no toggle

OpenAI caches a request's prompt prefix automatically once it's ≥1,024 tokens,
in 128-token increments, whenever an identical prefix was processed recently
(retention defaults to 24h for the GPT-5.x series as of a change on 2026-05-29,
up from a few minutes previously). Nothing in this codebase enables or disables
it — it's on by default for every call, and the only things a caller can
influence are (1) whether the prompt is actually shaped to benefit, and (2)
`prompt_cache_key`, a routing hint that groups related calls so they land on the
machine that already holds the matching cache.

## Static-first, dynamic-last

Caching matches from the **start** of the prompt and stops at the first byte
that differs. So the entire practice comes down to one rule: put everything that
never changes for a given caller first, and everything that changes every call
last.

`buildSalesAgentSystemPrompt` (`packages/ai-agent/src/prompts.ts`) already does
this correctly — the large, static instructional block comes first, and the
small per-conversation tail (customer name, conversation summary, recent
products) is appended after it in `graph.ts:371-380`. This wasn't something that
needed fixing; it's why `dm_reply` is worth caching at all.

Copilot's system prompt (`copilot-agent.ts`'s `buildSystemPrompt`) used to put
`Today's date is ${todayStr}` in its *second sentence* — found and fixed
alongside this plan. It's currently harmless (the whole prompt sits under the
1,024-token floor regardless), but the date sitting that early would have capped
any future growth of this prompt to "caches only within the same calendar day."
Moved to the end, after the static instructions, matching the pattern above.

## Per call site, measured, not assumed

Before wiring anything, each site's actual prompt was measured — a blanket "add
a cache key everywhere" would have been wrong for half of them:

| Source | Prompt size | Varies by | Cache key |
|---|---|---|---|
| `dm_reply` (`graph.ts`, `SalesAgentGraph`) | thousands of tokens | business (store name, tone, language, payment mode) | `businessId` |
| `copilot` (`copilot-agent.ts`) | ~250 tokens today, grows with tool defs | **tier only** — the prompt text never interpolates business data; store name, sales figures etc. come back through tool *results*, not the prompt | `` `copilot-${tier}` `` |
| `product_keywords` (`product-search-text.ts`) | ~2,000 tokens | **nothing** — `KEYWORD_SYSTEM_PROMPT` is a byte-identical constant for every business, every call | `"product-keywords-v1"` |
| `comment_reply` (`comment-reply.ts`) | ~300 tokens | — | **not set** — under the 1,024-token floor, always |
| `conversation_followup` / `weekly_insights` (`SimpleChatAgent`) | ~40 tokens | — | **not set** — same reason |
| Whisper transcription | n/a | — | **not applicable** — not a chat-completions call |

**Key granularity is chosen per prompt, not defaulted to `businessId`
everywhere.** Copilot's prompt doesn't vary by business, so keying it by
business would fragment one shared, byte-identical prefix into dozens of
business-sized slivers, each seeing a fraction of the traffic — keying by
`tier` instead pools every business on the same tier into one cache lineage.
`product_keywords` goes further: since the prompt never varies at all, one
single shared key pools *all* traffic platform-wide.

The `-v1` suffix on `product-keywords-v1` is deliberate, not decoration — bump
it if that prompt's text ever changes, so an edited prompt can't silently serve
cached computation from before the edit under the same key.

**Three sites are explicitly left unwired, not overlooked.** Their prompts
measure well under the 1,024-token floor, so no `prompt_cache_key`, no matter
how it's chosen, can make them eligible. Wiring one in would be inert code
solving nothing — if you're reading this because you're about to add one,
measure the prompt first; if it's grown past ~1,024 tokens since this was
written, it may be worth revisiting.

## `prompt_cache_retention`

Set explicitly to `"24h"` on `dm_reply` and `product_keywords` — the two sites
large enough for retention to matter — rather than trusting the account
default, which depends on Zero Data Retention status and can change under an
account setting nobody touched in this codebase. Not set on `copilot`: its
prompt is currently sub-threshold, so setting retention on it today would be
premature; revisit if/when that prompt grows past 1,024 tokens (see the table
above).

## How to check it's actually working

`packages/api/src/lib/platform-cost.ts`'s `recordLlmUsage` — the one function
all six call sites funnel their token counts through — logs one line per call:

```
[cache] dm_reply gpt-5.4-mini HIT — 4000/4900 prompt tokens cached (82%)
[cache] dm_reply gpt-5.4-mini MISS — 6895 prompt tokens, none cached
[cache] comment_reply gpt-5.4-mini NOT ELIGIBLE — 210 prompt tokens, below OpenAI's 1024-token floor
```

Three states, not two, on purpose — a sub-threshold call is never going to
cache regardless of any key, and logging it as `MISS` would read as something
broken when it's actually just too small. `grep "\[cache\]"` in the worker logs
for the live signal; the same split is also queryable from `platformCostEvent`
(`:input` vs `:cached_input` rows per source) for a longer view, and surfaces in
the superadmin Economics tab's cost-by-source chart once there's enough real
traffic to make the split visible.

**Caching's payoff scales with how many messages a single business sends
within the retention window.** At low per-business volume, a store's cache can
go cold between conversations regardless of the 24h retention — this plan makes
caching structurally correct and gives it every chance to work, but it can't
manufacture traffic. Revisit the actual hit rate once there's real volume to
judge it against, not immediately after deploy.
