# SellPilot AI — Payments Requirements (Phase 1)

**Status:** Baseline for build · **Source of truth:** `SellPilot_AI_SRS_v1.0.md` (Phase 1)
**Scope rule:** This document contains *only* what the Phase 1 spec asks for. Nothing has been
added beyond it. Anything not listed here is out of scope until the client says otherwise.

---

## 1. The two payment domains

The spec keeps these strictly separate, and so must the implementation. Mixing them would route a
business's customer revenue into SellPilot's own merchant account.

| | **A — Business Payments** | **B — SaaS Billing** |
|---|---|---|
| Who pays whom | End customer → the business | Business owner → SellPilot AI |
| Spec section | §3.8 (FR-PAY-01…03) | §3.11 (FR-SAS-01…08) |
| Merchant account | Each business's own | SellPilot's platform account |
| Methods | bKash, Nagad, Card, COD | Card only |
| Records | `transaction` table | `saas_invoice`, `payment_method` tables |
| Where credentials live | `business_profile` (per tenant) | `platform_settings` (one row, superadmin) |

---

## 2. Requirements

### 2.1 Business payments — collecting from end customers

| ID | Requirement | Priority |
|---|---|---|
| FR-PAY-01 | Owner can connect/manage **bKash, Nagad, Card (via SSLCommerz), and Cash on Delivery**, each showing a visible connection status. | High |
| FR-PAY-02 | Payments screen lists every transaction with Transaction ID, Order reference, Amount, Delivery Charge, Method, Status (Success / Refunded), and an **absolute** date & time. | High |
| FR-PAY-03 | Summary stat cards: Total Collected (period), Pending COD, Delivery Charges Collected, Refunds. | Medium |
| FR-AGT-11 | The AI agent presents bKash / Nagad / Card / COD in chat and **generates an automatic payment link**. | High |
| FR-ORD-05 | Delivery charge is recorded as a distinct line item, included in the total and in financial reporting. | Medium |

### 2.2 SaaS billing — collecting subscriptions from business owners

| ID | Requirement | Priority |
|---|---|---|
| FR-SAS-05 | Checkout captures Cardholder Name, Card Number (16-digit, auto-detect Visa/Mastercard/Amex), Expiry, CVC, Billing Address — with live card preview, accepted-card indicators, "save card for future billing", an order summary reflecting trial credit, and a PCI-DSS/SSLCommerz security notice. | High |
| FR-SAS-06 | On success: confirmation showing amount charged, **masked** payment method, next billing date, and a downloadable invoice. | High |
| FR-SAS-04 | Billing screen shows plan + status, trial countdown, usage meters, connected payment method, and full invoice history. | High |
| FR-SAS-07 | Trial expiry with no active payment method locks the account (data preserved) behind an inline plan picker. | High |

### 2.3 Cross-cutting obligations

| Source | Obligation |
|---|---|
| §4.3 | **bKash API** and **Nagad API** are listed as *separate* interfaces, each providing "payment link generation and payment status callback for customer orders". **SSLCommerz** is scoped to "**card** payment processing for both customer orders and SellPilot AI subscription billing". |
| §4.4 | Gateway status updates arrive via **secured webhook callbacks** and must be reconciled against order/subscription records. |
| §5.3 | Card data handled **exclusively** through PCI-DSS compliant gateways. SellPilot must **never** store raw card numbers or CVC. |
| §5.4 | Payment webhooks and subscription renewal jobs must **retry with backoff** so business-critical events are never silently dropped. |
| §5.7 | Service boundaries must accommodate the Stage 2–5 roadmap without a Phase 1 rebuild. |
| §5.8 | Must comply with Bangladesh Bank and gateway regulatory requirements for bKash, Nagad, and card transactions. |
| §7 | `Payment Method` entity stores only card last-4, type, expiry, saved flag — "raw card data lives in the PCI-DSS gateway, not in SellPilot AI's own database". |

---

## 3. Current state vs. required state

### Already built and meeting spec

- SSLCommerz hosted-checkout integration — `packages/api/src/lib/sslcommerz.ts`
- Customer order checkout + server-to-server validation — `packages/api/src/router/checkout.ts`
- Cash on Delivery — `checkout.confirmCod`, recorded as a `cod` transaction
- Transaction ledger, summary cards, refunds — `packages/api/src/router/payments.ts`
- SaaS subscription billing on the platform's own SSLCommerz account, card/bank rails only — `packages/api/src/router/subscription.ts`
- Webhook/IPN endpoints for both domains — `apps/nextjs/src/app/api/payments/sslcommerz/*`, `apps/nextjs/src/app/api/billing/*`
- The `transaction` table is **already provider-agnostic**: `method` ∈ `bkash|nagad|card|internetbank|cod`, plus `reference` and a `provider_payload` JSONB column. No schema change needed to add providers.

### Gaps against spec

| # | Gap | Spec reference | Impact |
|---|---|---|---|
| **G1** | **bKash is not directly integrated.** Today bKash is only a rail *inside* SSLCommerz's hosted checkout page. There is no bKash Merchant API client in the codebase. | §4.3 lists bKash API as its own interface | Customer is redirected to a browser checkout page instead of paying inside the bKash app. Aggregator fees apply. |
| **G2** | **Nagad is not directly integrated.** Same as above. | §4.3 lists Nagad API as its own interface | Same as G1. |
| **G3** | FR-PAY-01 asks for bKash/Nagad/Card/COD as **independently connectable** methods with their own status. Today all three online methods share one SSLCommerz credential pair, and their "status" is derived from an SSLCommerz capability probe rather than a real per-provider connection. | FR-PAY-01 | Owner cannot connect bKash without also connecting card, and vice versa. |
| **G4** | Per-tenant gateway credentials (`business_profile.sslcommerz_store_password`) are stored **in plaintext**, while Shopify/WooCommerce credentials in the same codebase *are* encrypted at rest via `packages/api/src/lib/store-import/crypto.ts`. | §5.3, §5.8 | Inconsistent security posture on the more sensitive of the two credential types. |
| **G5** | Subscription renewal cannot charge a saved card automatically; every renewal requires the owner to re-enter hosted checkout. "Add Payment Method" performs a real ৳10 verification charge purely to capture card metadata. | FR-SAS-04 implies a usable stored method | Renewals depend on manual owner action; higher involuntary churn. **See §4.1 — this may be solvable.** |
| **G6** | ✅ **Built — needs sandbox verification.** `payments.refund` now calls SSLCommerz's refund API for gateway payments, with a two-step confirmation in the UI, a `refund_pending` state for the async settlement, and `payments.syncRefundStatus` to resolve it. COD and pre-G7 payments fall back to ledger-only with an explicit warning. | FR-PAY-02 `Refunded` status | ⚠️ **Response field names were inferred from documentation summaries, not an official field spec — must be validated against the SSLCommerz sandbox before going live.** Remaining: an automatic worker sweep over `refund_pending` rows (today an owner clicks to refresh). |
| **G7** | ✅ **Fixed for new payments.** `transaction.reference` stores SSLCommerz's `val_id`, but `bank_tran_id` — the required key for its refund API — was never persisted. `validatePayment` now returns it and `markOrderPaid` writes it (plus reconciliation fields) into the already-existing `transaction.provider_payload` column. No migration was needed. | Prerequisite for G6 | **Remaining:** transactions created *before* this change still have no `bank_tran_id` and can only be refunded via the SSLCommerz merchant portal, not the API. |

---

## 4. Verified provider capabilities

Checked against the providers' own published documentation (August 2026). These findings change
several assumptions in the earlier draft of this document.

### 4.1 SSLCommerz

| Finding | Detail | Consequence |
|---|---|---|
| **Refund API exists** ✅ | `GET /validator/api/merchantTransIDvalidationAPI.php` with `bank_tran_id`, `refund_trans_id`, `refund_amount`, `refund_remarks`, `store_id`, `store_passwd`. Status query by `refund_ref_id`. Returns `success` \| `processing` \| `failed` \| `refunded`. | **G6 is buildable.** Refunds should move real money, not just flip a ledger flag. Note the async `processing` state — refunds are not instant, so status must be polled. |
| **Refund needs `bank_tran_id`** ⚠️ | Not the `val_id` we currently persist as `transaction.reference`. | **G7.** Must capture and store `bank_tran_id` from the validator response going forward; historical rows need backfill or stay API-unrefundable. |
| **IPN carries `verify_sign` + `verify_key`** | The v4 docs show both fields but do not publish the hashing algorithm. The docs direct merchants to the separate Order Validation API (`store_id` + `store_passwd`) as the authoritative check. | Keep server-to-server validation as the source of truth (current code already does this correctly). Treat IPN as a trigger, never as proof. |
| **Card tokenising / recurring** ❓ | Third-party integration guides describe passing `recurringFlag: "T"` on initiate, with the callback returning a masked card number plus a reusable `cardToken` for later 1-click charges. **This is not present in the official v4 documentation.** | **Do not plan around this until confirmed in writing by SSLCommerz for this specific merchant account.** If real, it resolves **G5** properly. If not, the current invoice-and-remind ladder stands. → added to §6.4. |

### 4.2 bKash

| Finding | Detail | Consequence |
|---|---|---|
| **Grant-token rate limit** 🚨 | Token lifetime is 3600s. bKash's docs state: *"Do not call this API more than two times within an hour. If you exceed this limit, the API will return an error, and you will be blocked for one hour."* Refresh is expected around the 50–55 minute mark. | **Token caching is mandatory and must be shared across processes.** SellPilot runs `apps/nextjs` and `apps/worker` as separate processes — a naive per-process in-memory cache would double the call rate and trigger a one-hour lockout of *all* bKash payments. The existing Redis instance must hold the token with a distributed refresh lock. |
| **Webhooks are AWS SNS** ⚠️ | Delivered via Amazon SNS, carrying `Signature`, `SigningCertURL`, `SignatureVersion: "1"`. Requires acknowledging an SNS **subscription confirmation** before live notifications flow. | Not a simple HMAC endpoint. Needs SNS signature verification against the signing certificate, plus one-time subscription confirmation handling. Budget accordingly. |
| **Success-only notifications** | bKash notifies for *"successfully completed payment transactions only."* | Failure and timeout states can never be learned from the webhook. A status-query reconciliation path is **required**, not optional. |
| **Tokenized Checkout needs an Agreement** | Tokenized Checkout requires a customer "Agreement ID" established beforehand; payment then completes with PIN only. | For one-off chat-initiated purchases (our FR-AGT-11 case), the agreement step adds friction on first purchase. **Product decision needed** on Tokenized vs regular Checkout → §6.4. |
| **Refund APIs exist** ✅ | Separate refund-transaction and refund-status endpoints are documented. | Consistent with the SSLCommerz refund model; fits the same optional `refund` capability in the provider interface. |
| **Credentials** | `app_key`, `app_secret`, `username`, `password` — confirmed as shared with merchants during onboarding. | Matches §6.1. |

### 4.3 Nagad

| Finding | Detail | Consequence |
|---|---|---|
| **Server IP whitelisting required** 🚨 | Merchants must inform Nagad of the server's outbound IP and have it whitelisted before calls succeed. | **Infrastructure dependency, not just code.** The production deployment needs a stable/static outbound IP, and any hosting change or IP rotation silently breaks Nagad payments. This must be settled before Phase 4 starts. |
| **RSA key-pair signing** | Merchant generates a key pair; the private key signs sensitive request data, and the merchant public key is uploaded to Nagad. Nagad's own public key (from the portal) verifies responses, using **SHA256withRSA**. | Materially different from bKash's bearer-token model. Key storage, rotation, and never committing keys to source must be designed in. |
| **Portal-managed setup** | Merchant ID, key generation ("Key Generate" under Merchant Management), callback URL configuration, and public-key upload all happen in the Nagad Merchant Portal. | Several setup steps are manual/portal-side and cannot be automated — factor into onboarding runbook. |
| **Flow** | Initialize → complete/confirm → status check, with a configured callback URL. | Fits `createPayment` / `settlePayment` in the provider interface without distortion. |

---

## 5. ⚠️ One spec ambiguity requiring client confirmation

The SRS is internally inconsistent about SSLCommerz's role, and the answer changes scope materially:

- **§2.6 (Constraints)** — "Payment processing for business transactions (bKash, Nagad, Card) **must go through SSLCommerz or equivalent**". Read literally: today's build already satisfies the spec, and G1–G3 are not gaps.
- **§4.3 (Software Interfaces)** — lists `bKash API` and `Nagad API` as **separate interfaces** for customer orders, and scopes SSLCommerz to "**Card** payment processing". **FR-PAY-01** agrees, phrasing it "bKash, Nagad, **Card (via SSLCommerz)**".

**Recommended reading:** §4.3 + FR-PAY-01 are the more specific statements and should govern → build direct bKash and Nagad integrations, narrow SSLCommerz to card + SaaS billing.

**Practical argument for the same reading:** the product's core promise (FR-AGT-11) is that the AI agent drops a payment link into a WhatsApp/Messenger chat. bKash's and Nagad's own payment links open *inside their apps*; an SSLCommerz link opens a generic web checkout in a browser. For a chat-first product in the Bangladeshi market, that difference is felt directly by every customer — and direct integration also avoids the aggregator's per-transaction cut on the two highest-volume rails.

> **This is the single decision blocking the build plan.** If the client confirms §2.6 instead, Phase 1 payments are effectively complete and only G4 (credential encryption) needs work.

---

## 6. What is needed **from the client** to proceed

Nothing in the build plan can be completed without these. Merchant onboarding in
Bangladesh typically takes **2–4 weeks**, so these should be requested immediately — they are the
critical path, not the code.

### 6.1 bKash Merchant (blocking G1)

| Item | Notes |
|---|---|
| **Product choice** | **Tokenized Checkout** vs regular **Checkout** — see §4.2. Tokenized requires a customer Agreement before the first payment; regular Checkout does not. This decision changes the integration materially and should be made before Phase 3 starts. |
| `app_key`, `app_secret` | Issued at onboarding |
| `username`, `password` | For the grant-token flow |
| Sandbox credentials | Separate set; required before any production testing |
| **Webhook listener URL registration** | bKash provisions the listener URL manually via technical support during onboarding, then sends an **SNS subscription confirmation** that we must acknowledge. Not self-service. |
| API documentation pack | Exact endpoint contracts must come from bKash's issued docs, not assumption — public examples differ by account type |

### 6.2 Nagad Merchant (blocking G2)

| Item | Notes |
|---|---|
| Merchant ID | From Merchant Portal → Merchant Management |
| Merchant **private key** + Nagad **public key** | Generated/downloaded via "Key Generate" in the portal; merchant public key must be uploaded there. SHA256withRSA. |
| **Static outbound server IP** 🚨 | Nagad requires the calling server's IP to be whitelisted. **This is an infrastructure decision, not just a credential** — production hosting must provide a stable egress IP, and any change silently breaks payments. Confirm the deployment target can guarantee this before committing to Phase 4. |
| Callback URL | Configured in the Merchant Portal |
| Sandbox credentials | Separate set |
| API documentation pack | Same as above |

### 6.3 SSLCommerz (already integrated — confirm only)

| Item | Notes |
|---|---|
| Platform store ID + password | For SellPilot's **own** SaaS billing. Configurable today via the superadmin panel. |
| Confirm live vs sandbox | Currently controlled by `SSLCOMMERZ_IS_SANDBOX` |
| **Card tokenising / `recurringFlag`** | Needed to resolve **G5**. Third-party guides describe it; it is **absent from the official v4 docs** (§4.1). Get written confirmation from SSLCommerz whether stored-card recurring charging is enabled for this merchant account. |
| **Refund API enablement** | Needed for **G6**. Confirm the refund endpoint is enabled on the account and note any settlement-window restrictions on when a transaction becomes refundable. |

### 6.4 Product decisions needed

1. **Section 5 above** — confirm the §4.3 reading (direct bKash/Nagad) vs the §2.6 reading (SSLCommerz for everything). *This one gates Phases 3–4 entirely.*
2. **bKash Tokenized vs regular Checkout** (§4.2) — affects first-purchase friction in chat.
3. Should a business be able to connect **only** bKash (no card)? FR-PAY-01's per-method status implies yes.
4. **Refunds** — now known to be API-supported by both SSLCommerz and bKash (§4.1, §4.2). Confirm refunds should actually move money via API rather than only being recorded, and who is authorised to trigger them. Note SSLCommerz refunds return an async `processing` state, so the UI must show "refund pending" rather than immediate success.
5. **G5 fallback** — if SSLCommerz confirms no stored-card recurring charging, accept the invoice-and-reminder ladder as documented Phase 1 behaviour, or escalate.
6. Confirm settlement/reconciliation expectations under §5.8 — who reconciles provider settlement reports against the `transaction` ledger, and how often.

---

## 7. Explicitly out of scope for Phase 1

Listed so scope stays pinned:

- Any gateway other than bKash, Nagad, SSLCommerz — no Stripe, PayPal, Rocket, Upay, or card-scheme direct integrations
- Multi-currency (spec is BDT-only)
- Partial/split payments, instalments, EMI
- Payouts or settlement automation to business bank accounts
- Stage 2–5 roadmap items (CRM, Inventory, Revenue Intelligence, Commerce OS)

---

## 8. Acceptance criteria

Phase 1 payments are done when:

1. A business owner can independently connect bKash, Nagad, and Card, and see a true per-method connection status (FR-PAY-01).
2. The AI agent, in chat, generates a working payment link for the customer's chosen method (FR-AGT-11).
3. A completed payment on any method produces exactly one reconciled `transaction` row with the correct `method`, amount, and delivery charge (FR-PAY-02).
4. Webhooks from every provider are signature-verified, idempotent, and retried with backoff (§4.4, §5.4).
5. The Payments screen's four summary figures reconcile against the transaction ledger (FR-PAY-03).
6. No raw card number or CVC exists anywhere in SellPilot's database or logs (§5.3).
7. Per-tenant gateway credentials are encrypted at rest (§5.3, resolves **G4**).
8. SaaS subscription checkout and confirmation work end to end on the platform account (FR-SAS-05, FR-SAS-06).
9. A refund issued from the Payments screen **actually moves money** at the gateway, and the ledger reflects the gateway's authoritative status including the async `processing` state (FR-PAY-02, resolves **G6**).
10. Every new transaction persists the provider reference needed to refund it later (resolves **G7**).
11. The bKash access token is cached across **all** processes with a distributed refresh lock, and the grant-token endpoint is never called more than twice in any rolling hour (§4.2).

---

## Sources

Provider documentation reviewed August 2026:

- [bKash Developer Portal](https://developer.bka.sh/) — [Token Management](https://developer.bka.sh/docs/token-management-overview.md), [Webhooks](https://developer.bka.sh/docs/webhooks.md), [Tokenized Checkout Overview](https://developer.bka.sh/docs/tokenized-checkout-overview)
- [SSLCOMMERZ Developer Docs v4](https://developer.sslcommerz.com/doc/v4/)
- [Nagad — Corefy connector reference](https://corefy.com/docs/connectors/nagad/) *(third-party; authoritative contracts must come from Nagad's own onboarding pack)*

> ⚠️ Every finding above marked ❓ or sourced from third parties must be re-confirmed against the
> documentation pack issued with the client's own merchant accounts before implementation.

---

*Continues in [`PAYMENTS_BUILD_PLAN.md`](./PAYMENTS_BUILD_PLAN.md).*
