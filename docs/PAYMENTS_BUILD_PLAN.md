# SellPilot AI — Payments Build Plan (Phase 1)

**Companion to:** [`PAYMENTS_REQUIREMENTS.md`](./PAYMENTS_REQUIREMENTS.md)
**Scope rule:** Builds exactly the Phase 1 spec — bKash, Nagad, SSLCommerz (card), COD. No other
gateway is built. The provider abstraction exists to satisfy §5.7 (extensibility without a Phase 1
rebuild), not to add unrequested functionality.

> **Blocked on:** the §4.3-vs-§2.6 decision in `PAYMENTS_REQUIREMENTS.md` §4, and the merchant
> credentials in §5. Phases 0–2 can start immediately regardless; Phases 3–4 cannot.

---

## 1. Architectural decision

**Create `packages/payments` — one provider interface, one implementation per gateway.**

This mirrors `packages/queue`, which already solves the identical problem in this repo: a single
`QueueProvider` interface with `memory` / `redis` / `sqs` implementations selected at runtime.
Payments have the same shape — one contract, several vendors, choice varies per business.

**Why not keep extending `packages/api/src/lib/sslcommerz.ts`:** adding bKash and Nagad there
means every call site (`router/checkout.ts`, `router/payments.ts`, `router/subscription.ts`,
`apps/worker`, and four webhook routes) grows a three-way branch. Adding a fourth gateway later
would mean touching all of them again. With a provider registry, a new gateway is one new file
plus one registry entry.

**What must not leak into the interface:** SSLCommerz's redirect-to-hosted-page model is *not* the
universal shape. Verified against each provider's own documentation (August 2026):

| | SSLCommerz | bKash | Nagad |
|---|---|---|---|
| Auth | `store_id` + `store_passwd` per call | Bearer token, **1 h lifetime, max 2 grants/hour** | RSA **SHA256withRSA** request signing |
| Settlement | Validate by `val_id` | `execute` after return, then status query | Complete/confirm, then status check |
| Webhook trust | `verify_sign`/`verify_key`, but validation API is authoritative | **AWS SNS** signature + subscription confirmation | Signed callback |
| Webhook coverage | Success + failure | **Success only** | Callback |
| Refund | ✅ API (needs `bank_tran_id`) | ✅ API | ❓ confirm at onboarding |
| Extra infra | — | Cross-process token cache | **Static outbound IP whitelist** |

Three of those rows would have been designed wrong if the interface had been generalised from
SSLCommerz alone — hence `settlePayment` being defined as "reach an authoritative final state by
whatever means this provider requires" rather than "validate a transaction id".

---

## 2. Package layout

```
packages/payments/
├── package.json                 # @acme/payments
├── src/
│   ├── index.ts                 # registry: getProvider(name), listProviders()
│   ├── types.ts                 # PaymentProvider interface + shared types
│   ├── errors.ts                # typed failures (declined, expired, network, config)
│   └── providers/
│       ├── sslcommerz.ts        # Phase 1 — ported from packages/api/src/lib/sslcommerz.ts
│       ├── bkash.ts             # Phase 3
│       └── nagad.ts             # Phase 4
```

`packages/api` depends on `@acme/payments`; the routers stop importing gateway specifics entirely.

---

## 3. Provider interface

```ts
export type PaymentProviderName = "sslcommerz" | "bkash" | "nagad";
export type PaymentMethod = "bkash" | "nagad" | "card" | "internetbank" | "cod";

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Which rails this provider can settle — drives FR-PAY-01's per-method status. */
  readonly methods: readonly PaymentMethod[];
  readonly supportsRefund: boolean;

  /** Powers the Payments page connection status. Never throws on bad creds — returns ok:false. */
  verifyCredentials(creds: ProviderCredentials): Promise<CredentialCheckResult>;

  /** Returns the URL handed to the customer (hosted page, or an app-scheme link). */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Drives a payment to an authoritative final state. Idempotent — safe to call from the
   * return URL and the webhook and a retry. Each provider hides its own shape here:
   * SSLCommerz validates by val_id; bKash runs execute-then-query; Nagad verifies its
   * signed completion payload.
   */
  settlePayment(input: SettlePaymentInput): Promise<SettlementResult>;

  /** Signature-verifies and normalises an inbound webhook. Rejects unverified payloads. */
  parseWebhook(req: WebhookRequest): Promise<WebhookEvent>;

  refund?(input: RefundInput): Promise<RefundResult>;
}
```

Supporting types — deliberately provider-neutral:

```ts
interface CreatePaymentInput {
  credentials: ProviderCredentials;
  /** Our reference; the provider's own id comes back on the result. */
  reference: string;
  amount: number;              // whole taka (BDT)
  method?: PaymentMethod;      // restrict the rail when the customer already chose one
  customer: { name: string; phone: string; address?: string };
  description: string;
  urls: { success: string; fail: string; cancel: string; webhook: string };
}

type CreatePaymentResult =
  | { ok: true; paymentUrl: string; providerRef: string }
  | { ok: false; reason: string; code: PaymentErrorCode };

interface SettlementResult {
  status: "success" | "pending" | "failed";
  providerRef: string;
  method: PaymentMethod;
  amount: number;
  /** Card last-4 when the rail exposes it. Never a full PAN. (§5.3) */
  last4?: string;
  raw: Record<string, unknown>;   // → transaction.provider_payload
}
```

**Credential shapes differ per provider** and stay typed as a discriminated union — SSLCommerz
takes `{ storeId, storePassword }`, bKash `{ appKey, appSecret, username, password }`, Nagad
`{ merchantId, merchantPrivateKey, nagadPublicKey }`. The registry resolves and decrypts them; call
sites never touch the raw shape.

---

## 4. Data model changes

### 4.1 New: `payment_gateway_connection`

Replaces the two `sslcommerz_*` credential columns on `business_profile`, which cannot represent
three independently-connected providers (gap **G3**).

| Column | Notes |
|---|---|
| `business_id` | FK, cascade |
| `provider` | `sslcommerz` \| `bkash` \| `nagad` |
| `credentials` | JSONB, **encrypted at rest** (gap **G4**) |
| `enabled` | Owner can disable without deleting credentials |
| `status` | Last `verifyCredentials` result + `checked_at` |
| unique | `(business_id, provider)` |

Encryption reuses the existing AES-256-GCM helper at
`packages/api/src/lib/store-import/crypto.ts` (already used for Shopify/WooCommerce credentials),
promoted to a shared location. This closes the inconsistency where store credentials are encrypted
but the more sensitive gateway credentials are not.

### 4.2 `transaction` — two columns added

The table is otherwise already provider-agnostic (`method`, `reference`, `provider_payload`).

| Column | Why |
|---|---|
| `provider` | A `bkash` transaction may arrive via **direct bKash** *or* via SSLCommerz's bKash rail. Without this, settlement reports cannot be reconciled per provider (§5.8). Backfill existing rows to `'sslcommerz'`. |
| `refund_ref` | Each provider's refund handle — SSLCommerz's `bank_tran_id` (required by its refund API) and, once a refund is filed, its `refund_ref_id` for status polling. Closes **G7**: today only `val_id` is persisted, which cannot be refunded against. |

> Refunds are **asynchronous** at SSLCommerz (`processing` → `refunded`), so `transaction.status`
> needs a `refund_pending` state rather than flipping straight to `refunded` as it does today.

### 4.3 New: `payment_webhook_event`

Idempotency ledger — unique on `(provider, provider_event_id)`. Required because every gateway
retries deliveries, and §4.4/§5.4 demand reconciliation without double-crediting an order.

### 4.4 Unchanged

`payment_method`, `saas_invoice`, `platform_settings` — SaaS billing (domain B) stays card-only on
SSLCommerz and is untouched by provider work.

---

## 5. Phases

Ordered so that everything not blocked by merchant onboarding ships first.

### Phase 0 — Scaffold `@acme/payments` · **S** · *unblocked*
Package skeleton, `types.ts`, `errors.ts`, empty registry. No call-site changes, no behaviour
change. Merges green on its own.

### Phase 1 — Port SSLCommerz, unchanged · **M** · *unblocked*
Move `packages/api/src/lib/sslcommerz.ts` behind the `PaymentProvider` interface as the first
implementation. Rewrite `checkout.ts`, `payments.ts`, `subscription.ts`, the worker's renewal
handler, and the eight webhook routes to go through the registry.

> **Strictly a refactor.** No functional change; existing SSLCommerz flows must behave identically.
> This is the risk-reduction step that proves the interface fits before a second provider exists.

**Done when:** full typecheck passes, and a sandbox order pays end-to-end exactly as before.

### Phase 2 — Credential vault + per-provider connections · **M** · *unblocked*
Ship `payment_gateway_connection`, migrate the existing SSLCommerz credentials into it (encrypted),
and rework the Payments settings UI to show one connection card per provider with real per-method
status. Closes **G3** and **G4**.

**Done when:** existing tenants' SSLCommerz credentials still work post-migration, and no plaintext
gateway secret remains in the database.

### Phase 3 — bKash provider · **L** · 🔒 *blocked on merchant credentials*
Implement `providers/bkash.ts`: grant-token lifecycle, create payment, execute-on-return, status
query, SNS webhook verification, refund.

Three requirements that fall directly out of bKash's documented behaviour:

1. **Distributed token cache — mandatory.** bKash blocks the merchant for a full hour after more
   than two grant-token calls within an hour. SellPilot runs `apps/nextjs` and `apps/worker` as
   separate processes, so a per-process in-memory cache would double the call rate and lock out
   *all* bKash payments platform-wide. Cache the token in the **existing Redis instance** with a
   distributed refresh lock, refreshing at the 50–55 minute mark.
2. **SNS webhook handling, not HMAC.** bKash delivers via AWS SNS: verify `Signature` against
   `SigningCertURL` (`SignatureVersion: "1"`), and handle the one-time **subscription
   confirmation** callback before live notifications flow.
3. **Status reconciliation is not optional.** bKash notifies on *successful* payments only, so
   failed and abandoned payments can never be learned from the webhook. A polling/query path is
   required to resolve them.

> Exact endpoint contracts and field names must come from the API pack bKash issues at onboarding —
> **not** public examples, which differ by account type (Checkout vs Tokenized Checkout). If
> Tokenized Checkout is chosen, the customer **Agreement** flow is additional scope on first
> purchase.

**Done when:** a sandbox payment completes inside the bKash app and produces exactly one reconciled
`transaction` row; and a forced token-refresh storm across both processes never exceeds two grant
calls per hour.

### Phase 4 — Nagad provider · **L** · 🔒 *blocked on merchant credentials **and infrastructure***
Implement `providers/nagad.ts`: RSA key-pair request signing and response verification
(SHA256withRSA), initialize → complete flow, callback verification, status query.

> 🚨 **Infrastructure prerequisite:** Nagad whitelists the calling server's outbound IP. Production
> hosting must provide a **stable static egress IP**, and any hosting/IP change silently breaks
> Nagad payments. Confirm this with the deployment target *before* Phase 4 starts — it is not
> something the provider code can work around.

> Nagad's crypto model is materially different from bKash's token model. Private keys go in the
> same encrypted vault as other credentials (never env vars, never source), with rotation planned
> in from the start.

**Done when:** as Phase 3, in the Nagad sandbox, from a whitelisted static IP.

### Phase 5 — Agent payment links + Payments UI · **M** · depends on 3–4
Wire method selection into the AI agent's payment-link generation (FR-AGT-11) so the link matches
the rail the customer picked in chat, and finish the Payments screen's per-method status
(FR-PAY-01) and summary reconciliation (FR-PAY-03).

### Phase 6a — Capture the refund key · **S** · ✅ **DONE** — closes **G7**
`validatePayment` now returns `bank_tran_id` plus reconciliation fields (`store_amount`,
`tran_date`, risk flags), and `markOrderPaid` persists them to the already-existing
`transaction.provider_payload` column. **No migration required.**

Shipped ahead of the rest because every payment taken without it is permanently un-refundable via
API. The payload is an explicit allow-list, not the raw response, so a future change to
SSLCommerz's response shape cannot silently start persisting something sensitive (§5.3).

> Transactions predating this change have no `bank_tran_id` and remain portal-only refunds.

### Phase 6b — Real refunds · **M** · 🔒 *blocked on sandbox + client confirmation* — closes **G6**
`payments.refund` still only updates the local ledger; no money moves. It is now annotated as such
in the code so nobody mistakes it for a working refund. To finish:

- Call SSLCommerz's refund endpoint (`bank_tran_id`, `refund_trans_id`, `refund_amount`,
  `refund_remarks`) via the provider interface's optional `refund` capability.
- Add a `refund_pending` status and a poll job for the async `processing` → `refunded` transition;
  the UI must stop flipping straight to Refunded.
- Providers without an API refund keep the manual-record path via the capability flag.

**Deliberately not built blind.** This moves real customer money, so it needs the refund endpoint
confirmed enabled on the account (§6.3) and a sandbox run before it ships.

**Done when:** a sandbox refund moves real money and the ledger mirrors the gateway's authoritative
status through the full `processing` → `refunded` transition.

### Phase 7 — Webhook hardening · **M** · depends on 3–4
Idempotency via `payment_webhook_event`, signature verification enforced on every provider
(including SNS certificate verification for bKash), retry-with-backoff, and a reconciliation job
that flags transactions stuck `pending` beyond a threshold — which is the *only* way bKash failures
surface, given its success-only notifications. Satisfies §4.4 and §5.4.

### Phase 8 — SaaS billing review · **S** · depends on client answer to **G5**
Get written confirmation from SSLCommerz whether `recurringFlag` card tokenising is enabled on the
platform account (it is described by third parties but absent from the official v4 docs). If yes,
replace the ৳10-verification-charge workaround with real stored-card renewals. If no, keep the
invoice-and-email-reminder ladder and document it as accepted Phase 1 behaviour.

---

## 6. Sequencing

```
Week 0  ├─ REQUEST MERCHANT ACCOUNTS (bKash + Nagad)   ← critical path, 2–4 weeks
        ├─ CONFIRM STATIC EGRESS IP for Nagad          ← infra, do not defer
        ├─ ASK SSLCOMMERZ: recurringFlag? refund API?  ← unblocks Phase 8 / Phase 6
        │
        ├─ Phase 0 ─ Phase 1 ─ Phase 2         (unblocked, proceed in parallel)
        ├─ Phase 6a: persist bank_tran_id      (unblocked, ship early — avoids backfill)
        │
Week 2–4├─ credentials arrive
        │
        ├─ Phase 3 (bKash) ─┐
        ├─ Phase 4 (Nagad) ─┴─ Phase 5 ─ Phase 6b ─ Phase 7
        │
        └─ Phase 8
```

**The merchant onboarding is the critical path, not the engineering.** Phases 0–2 are real,
shippable work that de-risks everything downstream and can be completed while paperwork clears.

Three items should be raised with the client/providers on **day one**, because each has a long lead
time and blocks work that cannot start without it: the merchant applications, the static-IP
decision for Nagad, and the two written questions to SSLCommerz.

---

## 7. Testing

| Layer | Approach |
|---|---|
| Provider units | Mocked HTTP against recorded provider fixtures. Cover: success, decline, timeout, malformed response, replayed webhook. |
| Signature/crypto | Nagad SHA256withRSA sign/verify and bKash **SNS certificate** verification tested against known-good vectors from the merchant packs. Include a tampered-payload case that must be rejected. |
| Token cache | Simulate simultaneous cold start of `apps/nextjs` + `apps/worker`; assert exactly one grant-token call. Assert the refresh lock holds under concurrency and never exceeds 2 calls/hour. |
| Refunds | Full async transition `success` → `refund_pending` → `refunded`, plus a `failed` refund that must not zero out the ledger. |
| Idempotency | Same webhook delivered 3× must produce exactly one `transaction` row and one order status change. |
| Sandbox E2E | One full order per provider: chat → agent link → payment → webhook → transaction → Payments screen. |
| Migration | Phase 2's credential migration verified on a copy of production data before rollout. |
| Regression | After Phase 1, existing SSLCommerz card + COD flows must be byte-for-byte equivalent in behaviour. |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **bKash grant-token lockout** 🚨 | Exceeding 2 token calls/hour blocks the merchant for an hour — an outage of *all* bKash payments, easily caused by a deploy that restarts both processes. Distributed Redis token cache + refresh lock is a Phase 3 hard requirement, with an alert if the call rate approaches the limit. |
| **Nagad IP whitelist breaks on infra change** 🚨 | Static egress IP confirmed before Phase 4; documented in the deploy runbook as a payment-critical constraint so a future hosting migration does not silently kill Nagad. |
| **bKash never reports failures** | Success-only webhooks mean stuck payments are invisible without polling. The Phase 7 reconciliation job is what makes this safe, not an optimisation. |
| Merchant onboarding slips beyond 4 weeks | Phases 0–2 and 6a carry real value independently; SSLCommerz keeps serving every rail meanwhile, so there is no functional regression if bKash/Nagad land late. |
| Provider API contracts differ from public documentation | Treat the onboarding pack as sole source of truth; build against sandbox before writing final types. Already seen: SSLCommerz's `recurringFlag` is widely documented by third parties but absent from its official v4 docs. |
| Interface proves too SSLCommerz-shaped | Phase 1 exists precisely to surface this early, while there is still only one implementation to change. |
| Nagad key management mishandled | Keys stored via the same encrypted vault as other credentials; never in env vars or source. |
| Double-crediting on webhook retries | `payment_webhook_event` idempotency ledger is a Phase 7 hard requirement, not optional. |
| Refund semantics differ per provider | Interface makes `refund` optional and capability-flagged; providers without API refunds fall back to the existing manual-record path. Async `processing` states are modelled explicitly rather than assumed instant. |
| Refunding historical transactions | Transactions written before Phase 6a lack `bank_tran_id` and cannot be refunded via API. Shipping 6a early minimises the affected window; anything older needs a manual/portal refund path. |

---

## 9. Definition of done

Phase 1 payments are complete when all eleven acceptance criteria in
[`PAYMENTS_REQUIREMENTS.md` §8](./PAYMENTS_REQUIREMENTS.md#8-acceptance-criteria) pass, and:

- Adding a future gateway requires **one new file in `providers/` plus one registry entry** — no
  changes to routers, workers, or UI (§5.7).
- No raw card number or CVC appears in the database, logs, or provider payload storage (§5.3).
- Every gateway credential and private key in the database is encrypted at rest.
- Every payment webhook is signature-verified, idempotent, and retried with backoff.
- A refund issued in the UI moves real money and reflects the gateway's authoritative status.
- The bKash token cache is shared across processes and provably stays within the 2-calls/hour limit.
