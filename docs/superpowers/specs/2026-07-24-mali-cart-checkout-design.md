# Mali Cart/Checkout/Payment Design

Date: 2026-07-24
Status: Approved by user (verbal "对就这样" / "yes, that's it")

## Context

The Cameroon storefront (camaroom-web) has a full cart -> quote -> manual
MoMo/Orange Money payment flow, plus inventory stock badges and shipment
tracking, backed by a Cloudflare Worker + D1 database
(`camaroom-cart-backend`). Mali-website is a static sibling site generated
from the same template by `scripts/generate_country_site.py`, with cart
explicitly disabled (`CART_ENABLED = false`, `CART_API_BASE = ''`) because no
backend has ever been deployed for it.

User wants Mali to have the same cart/checkout/payment (and inventory/
shipment) functionality as Cameroon.

## Goals

- Mali storefront gets the same customer-facing flow as Cameroon: add to
  cart, submit order, sales rep quotes it, customer pays via manual mobile
  money transfer, rep marks it paid.
- Mali also gets inventory stock badges and shipment tracking, matching
  Cameroon's current feature set (full parity, not a reduced scope).
- Mali's backend is operationally isolated from Cameroon's: a bug, outage,
  or load spike on one cannot affect the other's live orders.
- No duplicated source code to maintain in two places.

## Non-goals

- Automated payment verification (unchanged from the existing Cameroon
  design — still manual "mark as paid" by a sales rep).
- Card/USD payments (out of scope, same as Cameroon).
- Wiring in a real local Mali WhatsApp rep contact — deferred by the user;
  Mali keeps the generator's existing default (shared Tom Yang contact only,
  `AGENT_PHONE_2` stripped).
- Combining Cameroon and Mali orders into one dashboard/view. They remain
  two separate admin backends with two separate logins.

## Architecture

**One codebase, two independent deployments.** `backend/` stays a single
source tree (this repo). It is deployed twice as two fully separate
Cloudflare Workers, each with its own D1 database and secrets:

- Cameroon (existing): `wrangler.toml`, Worker `camaroom-cart-backend`, D1
  `camaroom-orders`, `ORDER_CURRENCY = "XAF"`.
- Mali (new): `wrangler.mali.toml`, Worker `camaroom-cart-backend-mali`, D1
  `camaroom-orders-mali`, `ORDER_CURRENCY = "XOF"`.

This was chosen over (a) duplicating `backend/` into the separate
Mali-website git repo, and (b) a single shared multi-tenant Worker/D1 with a
`country` column on every table. Rationale: the backend is already almost
fully parameterized by env vars (`MOMO_TRANSFER_NUMBER`, `MOMO_ACCOUNT_NAME`)
— the currency check is the only hardcoded piece — so getting to "two
independently deployed instances" requires minimal code change, no schema
redesign, and no risk of a Mali code change accidentally touching Cameroon's
D1 data.

### Backend changes (apply to both deployments equally)

- `backend/src/orders.js`: replace the hardcoded `if (currency !== 'XAF')`
  check with `if (currency !== env.ORDER_CURRENCY)`. `createOrder()` already
  receives `db` but not `env`/currency config — thread `env.ORDER_CURRENCY`
  through `handleCreateOrder` into `createOrder`.
- `backend/wrangler.toml`: add `ORDER_CURRENCY = "XAF"` to `[vars]` (making
  the existing implicit XAF assumption explicit).
- `backend/wrangler.mali.toml` (new file): same shape as `wrangler.toml` but
  with Worker name `camaroom-cart-backend-mali`, `ORDER_CURRENCY = "XOF"`, a
  new D1 `database_id` (created via `wrangler d1 create camaroom-orders-mali`
  before first deploy), and `MOMO_TRANSFER_NUMBER`/`MOMO_ACCOUNT_NAME`.
- `backend/schema.sql` is applied to both D1 databases unchanged — no schema
  differences between the two countries.
- No other backend source file changes; auth, inventory, shipments, quote,
  and admin-page modules are already currency/country-agnostic.

### ⚠ Placeholder MoMo number — must be replaced before real use

Per the user's explicit choice, `wrangler.mali.toml` initially reuses
Cameroon's transfer number (`681105611`) and account name (`su jiangmin`) as
a placeholder. **This will very likely not work for a real transaction**: an
Orange Money Mali or Moov Money transfer to an MTN Cameroon MoMo number
spans different countries and different mobile network operators, and MTN
does not operate in Mali at all. The value is marked with an inline `TODO`
comment in `wrangler.mali.toml` and must be swapped for a real Mali
Orange Money/Moov Money number and account name before any customer is shown
these instructions or asked to pay.

### Frontend changes (Mali-website repo)

Two config lines in the already-generated `index.html`:

- `const CART_ENABLED = true;` (was `false`)
- `window.CART_API_BASE = 'https://camaroom-cart-backend-mali.<subdomain>.workers.dev';` (was `''`)

No other HTML/JS changes — the cart drawer, add-to-cart buttons, and order
form already exist in the generated file, inert behind `CART_ENABLED`. The
local-rep contact block and `AGENT_PHONE_2`/`CART_WHATSAPP_NUMBER` stay as
the generator already left them (stripped; falls back to the shared Tom Yang
contact) since wiring a real Mali rep is explicitly deferred.

### Admin access

Mali's Worker gets its own `wrangler secret put` values (session secret,
admin password hash) — independent from Cameroon's, set via the CLI, not
committed to the repo. The user needs to either run this themselves or give
Claude a password to set.

## Data flow

Identical to the existing Cameroon flow (see
`docs/superpowers/specs/2026-07-20-manual-momo-payment-design.md`), running
against the Mali Worker/D1 instead:

1. Customer submits cart on Mali storefront -> `POST
   <mali-worker>/api/orders` -> order created, status `submitted`, currency
   `XOF`.
2. Sales rep opens `<mali-worker>/admin/quote/:id`, enters a price -> status
   `quoted`, page shows transfer instructions (Mali MoMo/OM number, account
   name, amount in XOF, order ID as reference).
3. Customer transfers with the order ID as the reference.
4. Rep confirms the transfer landed in their own Mali mobile money app,
   clicks "Mark as paid" -> status `paid`.

## Error handling

- Same rules as Cameroon's existing `mark-paid` endpoint (requires `quoted`
  status, idempotent on already-`paid`, requires auth) — no changes, since
  this logic is currency/country-agnostic.
- `createOrder` now rejects any currency that doesn't match the deployment's
  `ORDER_CURRENCY` — e.g. an `XAF` order posted to the Mali Worker (or vice
  versa) is rejected the same way an invalid currency is rejected today.

## Testing

- Add a test case to `orders.test.js` (or parametrize the existing one)
  covering `env.ORDER_CURRENCY = 'XOF'` accepting XOF orders and rejecting
  XAF, alongside the existing XAF-deployment behavior.
- Full existing 74-test suite continues to run against both configs since
  the currency is now an input rather than a hardcoded constant.
- Manual verification: `wrangler dev --config backend/wrangler.mali.toml`,
  run submit -> quote -> mark-paid end to end locally before deploying to
  Cloudflare.

## Decisions log

- 2026-07-24: User confirmed separate backend/D1 per country over a shared
  multi-tenant backend, for operational isolation.
- 2026-07-24: User confirmed Mali quotes/collects in XOF, not XAF.
- 2026-07-24: User confirmed reusing Cameroon's MoMo number as a temporary
  placeholder rather than blocking on a real Mali number now — flagged above
  as not expected to actually work for a real transfer.
- 2026-07-24: User confirmed deferring the Mali local WhatsApp rep contact;
  keep the generator's existing shared-Tom-Yang-only default.
- 2026-07-24: User confirmed full feature parity (inventory + shipment
  tracking included, not just cart/payment).
