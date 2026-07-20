# Manual Mobile Money Payment Design

Date: 2026-07-20
Status: Approved (user delegated remaining review to post-completion; see Decisions log)

## Context

The Cameroon cart checkout (built in the `cameroon-cart-checkout` plan) currently
quotes an order and generates a Flutterwave payment link for the customer to pay
by card or mobile money. Flutterwave charges ~2% on mobile money collections plus
~1% to settle to a mobile money wallet (~3% total), and 4.8% on cards.

Decision: drop Flutterwave entirely. Customers pay by transferring directly to the
business's own MTN MoMo / Orange Money number. There is no third-party collection
fee for this path. Confirmation that a transfer arrived is done manually by a sales
rep, not by an automated webhook.

Card/USD payments are out of scope for now — they always require a licensed
processor (PCI-DSS, card network clearing) and cannot be manually confirmed the way
a mobile money wallet notification can. If a customer needs card payment later,
Flutterwave (or similar) can be reintroduced for that channel specifically; this
change removes it entirely rather than keeping it dormant.

## Goals

- Zero third-party payment processing fees for the Cameroon cart checkout.
- Sales rep can quote an order, hand the customer transfer instructions
  (MoMo/OM number, account name, amount, order ID as reference), and later mark
  the order paid after seeing the transfer land in their own MoMo/OM app.
- Reuse the order's own ID as the payment reference — no new reference field.

## Non-goals

- Any automated verification of the transfer (SMS parsing, bank API polling, etc).
- Card or USD payments.
- A standalone "pending orders" dashboard/list page (order volume is low; sales
  already navigates to a specific order's page via the WhatsApp order-ID message).

## Architecture

Removed entirely (this is a removal, not a toggle — dead code is not kept dormant):

- `backend/src/flutterwave.js`
- `backend/src/webhook.js`
- `POST /api/webhook/flutterwave` route in `backend/src/index.js`
- `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `PAYMENT_REDIRECT_URL`
  from `backend/wrangler.toml` / `backend/.dev.vars`
- `payment_link`, `flutterwave_tx_ref` columns from `backend/schema.sql`
  (the D1 database has never been deployed with real data, so this is a direct
  schema edit, not a migration)
- The USD/card currency option in the cart contact form and the
  `currency !== 'XAF' && currency !== 'USD'` check in `orders.js` (XAF only now)

Added:

- `MOMO_TRANSFER_NUMBER` (681105611) and `MOMO_ACCOUNT_NAME` (su jiangmin) as
  Worker config vars (not hardcoded), so the number can change without a code edit.
- `quote.js`: `submitQuote()` no longer calls Flutterwave. It sets `quoted_price`
  and status `quoted` directly. No new field is generated — the order's own ID
  (already a short human-typeable code, e.g. `REST-A1B2C3`) is the payment
  reference shown to the customer and matched by the sales rep.
- `quote.js`: new `markOrderPaid()` — transitions `quoted` -> `paid`, sets `paid_at`,
  and calls the existing `sendPaidNotification` email (kept as an order
  archive/reconciliation record, not a live alert — the sales rep is the one
  confirming, so nobody needs to be told something they already know).
- `index.js`: new authenticated route `POST /api/orders/:id/mark-paid`, gated by
  the same `isAuthenticated` check as the existing `/quote` route.
- `/admin/quote/:id` page: after quoting, renders transfer instructions (number,
  account name, amount, order ID as reference) instead of a payment link; the
  "send via WhatsApp" button sends this instruction text. A "Mark as paid" button
  calls the new endpoint.

## Data flow

1. Customer submits cart -> `POST /api/orders` -> order created, status `submitted`
   (unchanged).
2. Sales rep opens `/admin/quote/:id` (link/ID arrives via the customer's WhatsApp
   message, unchanged), enters a price -> `POST /api/orders/:id/quote` ->
   status `quoted`, page now shows transfer instructions with the order ID as the
   MoMo/OM transfer note. Sales sends this to the customer via WhatsApp.
3. Customer transfers to 681105611 with the order ID in the transfer note.
4. Sales rep sees the transfer land in their own MoMo/OM app, matches the order ID
   in the note against the order, opens `/admin/quote/:id` again, clicks
   "Mark as paid" -> `POST /api/orders/:id/mark-paid` -> status `paid`, `paid_at`
   set, archive email sent.

## Error handling

- `mark-paid` requires the order to currently be `quoted`; anything else
  (`submitted`, already `paid`) is rejected except the idempotent case below.
- Idempotent: if the order is already `paid`, `mark-paid` returns the current
  state without re-sending the archive email (mirrors the old webhook's
  "already processed" handling).
- `mark-paid` requires authentication, same as `/quote`.

## Testing

- `quote.test.js`: rewrite the payment-link-generation cases to cover the new
  no-Flutterwave `submitQuote`; add cases for `markOrderPaid` (valid transition,
  rejecting a non-`quoted` order, idempotent re-mark, unauthenticated rejection).
- Delete `webhook.test.js` (the feature it tests no longer exists).
- Manual verification: run the full flow locally against `wrangler dev` —
  submit a cart order, quote it, mark it paid, confirm the archive email call
  fires exactly once even if "mark as paid" is clicked twice.

## Decisions log

- 2026-07-20: User confirmed manual "mark as paid" button on the existing
  per-order admin page (not automated SMS/notification parsing, not a
  amount-only heuristic match).
- 2026-07-20: User confirmed dropping USD/card entirely rather than keeping
  Flutterwave dormant for that channel — can be re-added later if a customer
  specifically needs it.
- 2026-07-20: User confirmed order ID (already shown to the sales rep) doubles
  as the transfer reference, rather than requiring a separate generated code.
- 2026-07-20: User confirmed keeping the payment-confirmed archive email.
- 2026-07-20: User delegated the remaining implementation, testing, review, and
  merge to be completed autonomously while away; this spec was not reviewed
  line-by-line by the user before implementation started. Flag this explicitly
  in the final summary for their return.
