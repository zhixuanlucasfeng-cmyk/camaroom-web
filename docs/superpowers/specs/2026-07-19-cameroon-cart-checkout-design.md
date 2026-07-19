# Cameroon Cart + Online Payment (Phase 1) Design

**Goal:** Let Cameroon customers submit a multi-item cart, receive a sales-set price via WhatsApp, and pay online via MTN Mobile Money / Orange Money (or international card for USD orders) — replacing the current single-item "inquire on WhatsApp" flow with a full but lightweight checkout path, while keeping the existing consultative-sales relationship (Restar Solar's mother and sales reps still set the final price per order).

**Scope:** Cameroon only. Other country sites (Nigeria, Mali, Sudan, future Zambia) are explicitly out of scope for this phase — the architecture is designed so they can reuse the same backend later without rework, but no work is done for them now.

## Background

camaroom-web is currently a fully static site (GitHub Pages) with no backend. Sales happens through WhatsApp: a customer clicks an "inquire" or "quote request" button on a product, which opens a pre-filled `wa.me` link, and a human sales rep (mother, or reps Tom Yang / Luc Su) takes it from there entirely outside the website. There is no cart, no stored order data, and no online payment.

The business wants online payment, but the existing sales model is deliberately consultative (price often depends on install service, bulk, negotiation) — not impulse e-commerce. This design keeps that model: customers submit a *request* (cart of items + contact info + currency preference), a human sets the final price, and only then does the customer see a payable link.

## Non-Goals (Phase 1)

- No customer accounts / login — guest checkout only, identified by phone number.
- No delivery/shipment tracking in the system — fulfillment coordination stays manual over WhatsApp after payment, per existing practice for physical freight (panels, batteries).
- No admin dashboard / order list UI — sales interacts with a single-purpose quoting page per order, not a general back-office.
- No WhatsApp Business API / automated server-to-sales WhatsApp push — Meta business verification and ongoing cost aren't justified for Phase 1. New-order notification reuses the site's existing pattern: a pre-filled `wa.me` link that opens automatically for the *customer* to send with one tap.
- No support for Nigeria/Mali/Sudan/Zambia in this phase.
- No price editing after a payment link has been generated (a mis-quote requires generating a fresh order).

## Architecture

Three components, all within Cloudflare's ecosystem (consistent with the earlier decision to avoid running/maintaining a dedicated server):

1. **Frontend (camaroom-web, Cameroon site only):** a cart UI added to the existing product grid — "add to cart" replaces the current single-item "inquire" button; a cart drawer/page collects contact info + currency preference and submits the cart.
2. **Backend (Cloudflare Worker + D1):** serverless functions handling order creation, the sales quoting page, Flutterwave payment-link generation, and the payment webhook. D1 (Cloudflare's managed SQLite) stores orders.
3. **Payment (Flutterwave):** a payment aggregator, not a direct MTN/Orange integration — Flutterwave already supports Cameroon Mobile Money (MTN MoMo, Orange Money) and international card payments, so we avoid the slower, more complex path of applying for direct MTN/Orange merchant API access. We use Flutterwave's **hosted payment link** (their own checkout page) rather than building a custom payment UI, which keeps PCI/compliance burden off this codebase entirely.

## Order Lifecycle

```
submitted --> quoted --> paid
```

- **submitted**: customer has added items to cart, entered name/phone/currency preference, and submitted. Order is persisted immediately so nothing is lost even if the customer never taps "send" on the WhatsApp prompt.
- **quoted**: a sales rep has opened the quoting page for this order, entered a final price in the customer's chosen currency, and the system generated a Flutterwave payment link.
- **paid**: Flutterwave's webhook confirmed successful payment for that link.

No other states in Phase 1 (no "expired", no "cancelled" — YAGNI; if this becomes a real problem once the flow is live, it's a small follow-up).

## Data Model (D1)

One table is sufficient for Phase 1:

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,              -- e.g. "ord_" + random suffix
  created_at TEXT NOT NULL,         -- ISO 8601
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,     -- WhatsApp-reachable number, includes country code
  items TEXT NOT NULL,              -- JSON array: [{sku, name, qty}], denormalized snapshot at submit time
  currency TEXT NOT NULL,           -- "XAF" or "USD"
  status TEXT NOT NULL DEFAULT 'submitted',  -- submitted | quoted | paid
  quoted_price INTEGER,             -- minor units (e.g. centimes/cents) once quoted
  payment_link TEXT,                -- Flutterwave hosted checkout URL, once quoted
  flutterwave_tx_ref TEXT,          -- our reference passed to Flutterwave, used to match the webhook
  paid_at TEXT                      -- ISO 8601, set by webhook
);
```

`items` and `currency` are not hardcoded to Cameroon's catalog/XAF specifically — `currency` is a plain configurable field precisely so a later Nigeria/Mali/Sudan phase can reuse this table without a schema change.

## Request Flow

1. **Cart submission** — customer picks products, opens the cart, enters name + phone + currency preference (XAF default, USD optional), submits.
   - Frontend calls `POST /api/orders` on the Worker with `{customer_name, customer_phone, items, currency}`.
   - Worker generates an `id`, inserts the row with `status = 'submitted'`, returns `{id}`.
   - Frontend immediately opens (in a new tab, same pattern as the site's existing inquire/quote buttons) a pre-filled `wa.me` link addressed to the shared sales WhatsApp number, containing the order id and a summary of the cart. The customer taps send — this is the "notification," and it's customer-initiated by design (no WhatsApp Business API needed).

2. **Sales sets price** — sales rep opens `GET /admin/quote/:id` (password-protected — see Auth below), sees the order's items/customer info, enters a price in the order's currency, submits.
   - Frontend of that page calls `POST /api/orders/:id/quote` with `{price}`.
   - Worker validates the order is still `submitted` (not already quoted/paid — see Idempotency), calls the Flutterwave API to create a payment link for `quoted_price` in `currency`, tagged with a `flutterwave_tx_ref` equal to the order id (or a derivative), stores `payment_link` + `flutterwave_tx_ref`, sets `status = 'quoted'`.
   - Response includes the `payment_link`; the quoting page shows a "send via WhatsApp" button that opens a `wa.me` link pre-filled with the payment link, addressed to the customer's phone — one tap for sales to relay it.

3. **Customer pays** — customer opens the Flutterwave-hosted link, pays via MoMo/Orange Money (XAF orders) or card (USD orders).

4. **Payment confirmation** — Flutterwave calls `POST /api/webhook/flutterwave` on successful payment.
   - Worker verifies the webhook signature (Flutterwave sends a `verif-hash` header matching a secret configured in the Flutterwave dashboard).
   - Worker looks up the order by `flutterwave_tx_ref`. If already `paid`, no-op (see Idempotency). Otherwise sets `status = 'paid'`, `paid_at = now()`.
   - Worker sends a notification email to the sales team via a transactional email API (e.g. Resend's free tier) — this step *is* fully automatable server-side, unlike WhatsApp, so it carries the "automatic notification" the business wants for the "money has arrived" moment specifically.

## Auth for the Quoting Page

A single shared password (stored as a Worker secret), not a full user/login system — matches the "simple page, not a back-office" scope decision. The quoting page prompts for the password once; the Worker checks it on every `/admin/*` request (e.g. via a short-lived signed cookie after successful entry). If the shared password model ever becomes a real security concern (e.g. multiple reps needing separate accountability), that's a follow-up, not Phase 1.

## Error Handling

- **Flutterwave API call fails when generating a payment link** (step 2): the quoting page shows an error and lets sales retry — the order stays in `submitted`, no data is lost, since the order row was already persisted at cart-submission time.
- **Webhook arrives twice** (Flutterwave is documented to occasionally retry): idempotent by checking `status` before transitioning — a second call with the same `flutterwave_tx_ref` on an already-`paid` order is a no-op that still returns 200 (so Flutterwave doesn't keep retrying).
- **Webhook signature invalid**: reject with 401, do not update any order — guards against spoofed "payment succeeded" calls.
- **Quote submitted twice for the same order** (e.g. sales double-clicks, or reopens a stale tab): the Worker checks `status == 'submitted'` before creating a new payment link; if already `quoted` or `paid`, it returns the existing `payment_link` instead of generating a duplicate Flutterwave link.
- **Cart submitted with an empty item list or missing phone number**: rejected client-side before hitting the Worker; the Worker also validates server-side (never trust client validation alone) and returns 400.

## Testing Approach

- **Worker route logic** (order creation, quote validation, idempotency checks, webhook signature verification): unit tests against the Worker code using Cloudflare's `vitest`-based Workers testing tools (`@cloudflare/vitest-pool-workers`), with D1 accessed via its local/in-memory test binding — no real network calls.
- **Flutterwave integration**: tested against Flutterwave's sandbox/test-mode API and their documented test webhook payloads before go-live; no unit test can substitute for at least one real sandbox end-to-end run (create link → pay with a Flutterwave test MoMo number → confirm webhook fires and order flips to `paid`).
- **Frontend cart flow**: manual browser verification (matching how the rest of camaroom-web has been verified this project) — add items, submit, confirm the `wa.me` prefill is correct, confirm the quoting page round-trip produces a working payment link in Flutterwave's sandbox.

## Open Items Requiring Business Info (not blockers for building this)

- Flutterwave (or chosen aggregator) merchant account credentials — confirmed to exist already but not yet in hand; needed only at deploy time (stored as Worker secrets), not for building the code.
- The shared quoting-page password and the sales notification email address — small config values, needed before go-live, not before implementation.
