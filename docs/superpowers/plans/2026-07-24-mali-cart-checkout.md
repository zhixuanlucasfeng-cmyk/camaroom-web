# Mali Cart/Checkout/Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Mali storefront the same cart/checkout/manual-payment/inventory/shipment functionality Cameroon already has, via a second independent Cloudflare Worker + D1 deployment of the existing `backend/` codebase.

**Architecture:** One shared codebase in `camaroom-web/backend`, deployed twice from two `wrangler.*.toml` configs (Cameroon: `wrangler.toml`, Mali: `wrangler.mali.toml`), each with its own D1 database, currency, and MoMo transfer vars. `orders.js` and `quote.js` change from hardcoded `XAF`/"MTN Mobile Money or Orange Money" to reading `env.ORDER_CURRENCY` / `env.MOMO_NETWORK_LABEL`. The Mali-website static site gets two config lines flipped to point at the new Worker.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), vitest + `@cloudflare/vitest-pool-workers`, wrangler CLI.

## Global Constraints

- Mali orders must be quoted/collected in XOF, not XAF (per design spec).
- The Mali MoMo transfer number/account name are a temporary placeholder (Cameroon's real values) and must not be presented to a real customer as-is — flag this loudly, do not silently ship it as "done."
- No changes to Cameroon's live behavior: `wrangler.toml`'s `ORDER_CURRENCY` must resolve to `"XAF"` so existing behavior is unchanged.
- Full feature parity for Mali: cart, quote, mark-paid, inventory, shipments — not a reduced scope.
- Full existing 74-test suite must continue to pass.

---

### Task 1: Parameterize order currency validation

**Files:**
- Modify: `backend/src/orders.js:3-9` (`createOrder`), `backend/src/orders.js:32-46` (`handleCreateOrder`)
- Modify: `backend/wrangler.toml` (add `ORDER_CURRENCY` var)
- Test: `backend/test/orders.test.js`

**Interfaces:**
- Produces: `createOrder(db, { customer_name, customer_phone, items, currency }, expectedCurrency)` — third positional param, throws `invalid_currency` when `currency !== expectedCurrency`. Later tasks (quote.js tests) call `createOrder` via the `makeOrder()` test helper, which Task 2 also updates to pass `'XAF'` as the third arg.

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/orders.test.js`, replacing the two existing currency-rejection tests (they currently hardcode the XAF assumption inside `createOrder` itself) and adding XOF coverage:

```javascript
describe('createOrder', () => {
  it('creates an order and returns its id', async () => {
    const result = await createOrder(
      env.DB,
      {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
        currency: 'XAF',
      },
      'XAF'
    );

    expect(result.id).toMatch(/^REST-[0-9A-Z]{6}$/);
    expect(result.created_at).toBeTruthy();

    const stored = await getOrder(env.DB, result.id);
    expect(stored.customer_name).toBe('Jean');
    expect(stored.status).toBe('submitted');
    expect(JSON.parse(stored.items)).toEqual([{ sku: 'panel-450w', name: '450W Panel', qty: 2 }]);
  });

  it('rejects an order with no items', async () => {
    await expect(
      createOrder(
        env.DB,
        {
          customer_name: 'Jean',
          customer_phone: '+237600000001',
          items: [],
          currency: 'XAF',
        },
        'XAF'
      )
    ).rejects.toThrow('invalid_order');
  });

  it('rejects an order missing customer_phone', async () => {
    await expect(
      createOrder(
        env.DB,
        {
          customer_name: 'Jean',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'XAF',
        },
        'XAF'
      )
    ).rejects.toThrow('invalid_order');
  });

  it('rejects a currency that does not match the deployment currency', async () => {
    await expect(
      createOrder(
        env.DB,
        {
          customer_name: 'Jean',
          customer_phone: '+237600000001',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'EUR',
        },
        'XAF'
      )
    ).rejects.toThrow('invalid_currency');
  });

  it('rejects USD now that card payments are out of scope', async () => {
    await expect(
      createOrder(
        env.DB,
        {
          customer_name: 'Jean',
          customer_phone: '+237600000001',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'USD',
        },
        'XAF'
      )
    ).rejects.toThrow('invalid_currency');
  });

  it('accepts XOF orders when the deployment currency is XOF (Mali)', async () => {
    const result = await createOrder(
      env.DB,
      {
        customer_name: 'Awa',
        customer_phone: '+22376000001',
        items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
        currency: 'XOF',
      },
      'XOF'
    );
    expect(result.id).toMatch(/^REST-[0-9A-Z]{6}$/);
  });

  it('rejects an XAF order when the deployment currency is XOF (Mali)', async () => {
    await expect(
      createOrder(
        env.DB,
        {
          customer_name: 'Awa',
          customer_phone: '+22376000001',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'XAF',
        },
        'XOF'
      )
    ).rejects.toThrow('invalid_currency');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run test/orders.test.js`
Expected: FAIL — the new/changed cases fail because `createOrder` doesn't yet accept a third argument (it still hardcodes `!== 'XAF'`), so the XOF-acceptance case throws `invalid_currency` unexpectedly and the XAF-rejection-under-XOF case doesn't throw.

- [ ] **Step 3: Implement the minimal change**

In `backend/src/orders.js`, replace:

```javascript
export async function createOrder(db, { customer_name, customer_phone, items, currency }) {
  if (!customer_name || !customer_phone || !Array.isArray(items) || items.length === 0) {
    throw new Error('invalid_order');
  }
  if (currency !== 'XAF') {
    throw new Error('invalid_currency');
  }
```

with:

```javascript
export async function createOrder(db, { customer_name, customer_phone, items, currency }, expectedCurrency) {
  if (!customer_name || !customer_phone || !Array.isArray(items) || items.length === 0) {
    throw new Error('invalid_order');
  }
  if (currency !== expectedCurrency) {
    throw new Error('invalid_currency');
  }
```

And in the same file, update `handleCreateOrder`:

```javascript
export async function handleCreateOrder(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const order = await createOrder(env.DB, body, env.ORDER_CURRENCY);
    return new Response(JSON.stringify(order), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
}
```

(Only the `createOrder(env.DB, body)` call changes, to `createOrder(env.DB, body, env.ORDER_CURRENCY)`.)

In `backend/wrangler.toml`, add `ORDER_CURRENCY` to `[vars]`:

```toml
[vars]
MOMO_TRANSFER_NUMBER = "681105611"
MOMO_ACCOUNT_NAME = "su jiangmin"
ORDER_CURRENCY = "XAF"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/orders.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/lucasfeng/camaroom-web
git add backend/src/orders.js backend/wrangler.toml backend/test/orders.test.js
git commit -m "Parameterize order currency validation via ORDER_CURRENCY env var

Lets the same backend codebase be deployed for a second country
(Mali, XOF) without hardcoding Cameroon's XAF assumption."
```

---

### Task 2: Update `quote.test.js`'s `makeOrder()` helper and parameterize the MoMo network label

**Files:**
- Modify: `backend/test/quote.test.js:21-28` (`makeOrder` helper)
- Modify: `backend/src/quote.js:120,137,155` (network label in quote page HTML)
- Modify: `backend/wrangler.toml` (add `MOMO_NETWORK_LABEL`)
- Test: `backend/test/quote.test.js`

**Interfaces:**
- Consumes: `createOrder(db, orderData, expectedCurrency)` from Task 1.
- Produces: `env.MOMO_NETWORK_LABEL` — a human-readable string describing which mobile money networks the transfer instructions mention (e.g. `"MTN Mobile Money or Orange Money"` for Cameroon, `"Orange Money or Moov Money"` for Mali). Read by `handleGetQuotePage` and embedded in the transfer-instructions text shown to the sales rep/customer.

- [ ] **Step 1: Update the test helper (this is a required fix, not new test coverage — `makeOrder()` breaks under Task 1's new signature)**

In `backend/test/quote.test.js`, replace:

```javascript
async function makeOrder() {
  return createOrder(env.DB, {
    customer_name: 'Jean',
    customer_phone: '+237600000001',
    items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
    currency: 'XAF',
  });
}
```

with:

```javascript
async function makeOrder() {
  return createOrder(
    env.DB,
    {
      customer_name: 'Jean',
      customer_phone: '+237600000001',
      items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
      currency: 'XAF',
    },
    'XAF'
  );
}
```

Also add `env.ORDER_CURRENCY = 'XAF';` and `env.MOMO_NETWORK_LABEL = 'MTN Mobile Money or Orange Money';` to the existing `beforeEach` block (alongside the existing `env.RESEND_API_KEY` etc. lines), so `handleGetQuotePage`/`submitQuote` calls in this file have realistic env values.

- [ ] **Step 2: Run tests to verify current state**

Run: `cd backend && npx vitest run test/quote.test.js`
Expected: PASS — this step alone doesn't change production code yet, it just fixes the helper so the suite keeps passing after Task 1. Confirms the fix is correct before moving on.

- [ ] **Step 3: Write a failing test for the network label**

Add a new test to `backend/test/quote.test.js`, in a new `describe('handleGetQuotePage', ...)` block:

```javascript
import { handleGetQuotePage } from '../src/quote.js';

describe('handleGetQuotePage', () => {
  it('shows the deployment-configured MoMo network label in transfer instructions', async () => {
    const { id } = await makeOrder();
    await submitQuote(env.DB, env, id, 150000);
    env.MOMO_NETWORK_LABEL = 'Orange Money or Moov Money';

    const res = await handleGetQuotePage({}, env, id);
    const html = await res.text();

    expect(html).toContain('Orange Money or Moov Money');
    expect(html).not.toContain('MTN Mobile Money');
  });
});
```

(Add the `handleGetQuotePage` import alongside the existing `submitQuote, markOrderPaid` import from `../src/quote.js`.)

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx vitest run test/quote.test.js`
Expected: FAIL — `quote.js` still hardcodes `"MTN Mobile Money or Orange Money"`, so the HTML contains that literal string regardless of `env.MOMO_NETWORK_LABEL`.

- [ ] **Step 5: Implement the minimal change**

In `backend/src/quote.js`, inside `handleGetQuotePage`, after the existing `momoName` line:

```javascript
  const momoNumber = escapeHtml(env.MOMO_TRANSFER_NUMBER || '');
  const momoName = escapeHtml(env.MOMO_ACCOUNT_NAME || '');
```

add:

```javascript
  const momoNetworkLabel = escapeHtml(env.MOMO_NETWORK_LABEL || '');
```

Then replace both occurrences of the hardcoded string. First occurrence (inside the client-side `<script>` template literal, line ~137):

```javascript
                var instructions = 'Please send ' + data.quoted_price + ' ${escapeHtml(order.currency)} via MTN Mobile Money or Orange Money to ${momoNumber} (${momoName}). Include order ' + data.id + ' as the transfer note/reference.';
```

becomes:

```javascript
                var instructions = 'Please send ' + data.quoted_price + ' ${escapeHtml(order.currency)} via ${momoNetworkLabel} to ${momoNumber} (${momoName}). Include order ' + data.id + ' as the transfer note/reference.';
```

Second occurrence (server-rendered, line ~155):

```javascript
    const instructions = `Please send ${order.quoted_price} ${escapeHtml(order.currency)} via MTN Mobile Money or Orange Money to ${momoNumber} (${momoName}). Include order ${escapeHtml(order.id)} as the transfer note/reference.`;
```

becomes:

```javascript
    const instructions = `Please send ${order.quoted_price} ${escapeHtml(order.currency)} via ${momoNetworkLabel} to ${momoNumber} (${momoName}). Include order ${escapeHtml(order.id)} as the transfer note/reference.`;
```

In `backend/wrangler.toml`, add `MOMO_NETWORK_LABEL` to `[vars]`:

```toml
[vars]
MOMO_TRANSFER_NUMBER = "681105611"
MOMO_ACCOUNT_NAME = "su jiangmin"
ORDER_CURRENCY = "XAF"
MOMO_NETWORK_LABEL = "MTN Mobile Money or Orange Money"
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/quote.test.js`
Expected: PASS (13 tests)

- [ ] **Step 7: Run the full suite to check for regressions**

Run: `cd backend && npm test`
Expected: PASS (all 9 test files, 77 tests total)

- [ ] **Step 8: Commit**

```bash
cd /Users/lucasfeng/camaroom-web
git add backend/src/quote.js backend/wrangler.toml backend/test/quote.test.js
git commit -m "Parameterize MoMo network label via MOMO_NETWORK_LABEL env var

Cameroon's transfer instructions say \"MTN Mobile Money or Orange
Money\" — MTN doesn't operate in Mali, so this must be configurable
per deployment rather than hardcoded."
```

---

### Task 3: Add the Mali wrangler config

**Files:**
- Create: `backend/wrangler.mali.toml`
- Modify: `backend/package.json` (add `dev:mali` / `deploy:mali` scripts)

**Interfaces:**
- Consumes: `ORDER_CURRENCY`, `MOMO_NETWORK_LABEL`, `MOMO_TRANSFER_NUMBER`, `MOMO_ACCOUNT_NAME` vars from Tasks 1-2.
- Produces: a wrangler config Task 4 references when creating the D1 database, and Task 5 uses to deploy.

- [ ] **Step 1: Create `backend/wrangler.mali.toml`**

```toml
name = "camaroom-cart-backend-mali"
main = "src/index.js"
compatibility_date = "2024-11-01"

[vars]
# TODO(mali-momo): PLACEHOLDER — this is Cameroon's real MoMo number/account,
# reused temporarily. An Orange Money Mali / Moov Money transfer to this
# MTN-Cameroon number will very likely fail (different country, different
# network — MTN does not operate in Mali). Replace both values with a real
# Mali Orange Money or Moov Money number/account name before giving these
# instructions to any real customer.
MOMO_TRANSFER_NUMBER = "681105611"
MOMO_ACCOUNT_NAME = "su jiangmin"
ORDER_CURRENCY = "XOF"
MOMO_NETWORK_LABEL = "Orange Money or Moov Money"

[[d1_databases]]
binding = "DB"
database_name = "camaroom-orders-mali"
database_id = "REPLACE_AFTER_D1_CREATE"
```

- [ ] **Step 2: Add npm scripts**

In `backend/package.json`, change `scripts` from:

```json
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
```

to:

```json
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "dev:mali": "wrangler dev --config wrangler.mali.toml",
    "deploy:mali": "wrangler deploy --config wrangler.mali.toml"
  },
```

- [ ] **Step 3: Verify the config parses**

Run: `cd backend && npx wrangler deploy --config wrangler.mali.toml --dry-run --outdir /tmp/mali-dry-run`
Expected: Succeeds and prints a build summary (no actual deploy happens with `--dry-run`; this only validates the TOML and that `src/index.js` bundles cleanly). It will NOT fail on the placeholder `database_id` since dry-run doesn't hit the Cloudflare API for D1 binding validation the same way a real deploy does — if it does complain about the placeholder ID, that's expected and resolved in Task 4 (leave `wrangler.mali.toml` as-is and proceed).

- [ ] **Step 4: Commit**

```bash
cd /Users/lucasfeng/camaroom-web
git add backend/wrangler.mali.toml backend/package.json
git commit -m "Add wrangler config for a second (Mali) cart backend deployment

Same codebase, separate Worker/D1/currency/MoMo config. database_id
is a placeholder until the D1 database is created in Task 4."
```

---

### Task 4: Create the Mali D1 database, apply schema, deploy the Worker, set secrets

**This task performs real, hard-to-reverse actions against the user's live Cloudflare account** (creates a billed resource, deploys a public internet-facing endpoint). Confirm with the user immediately before running the `wrangler d1 create` and `wrangler deploy` commands below, even though the design was already approved — creating cloud infrastructure is a step up in blast radius from writing code, per this project's safety norms.

**Files:**
- Modify: `backend/wrangler.mali.toml` (fill in real `database_id`)

**Interfaces:**
- Consumes: `wrangler.mali.toml` from Task 3.
- Produces: a live Worker at `https://camaroom-cart-backend-mali.<subdomain>.workers.dev`, ready for Task 5's frontend wiring.

- [ ] **Step 1: Create the D1 database**

Run: `cd backend && npx wrangler d1 create camaroom-orders-mali`
Expected: Output includes a `database_id` (UUID) and a `[[d1_databases]]` TOML snippet.

- [ ] **Step 2: Fill in the real database_id**

Edit `backend/wrangler.mali.toml`, replacing `database_id = "REPLACE_AFTER_D1_CREATE"` with the UUID printed in Step 1.

- [ ] **Step 3: Apply the schema to the new database**

Run: `cd backend && npx wrangler d1 execute camaroom-orders-mali --remote --file=./schema.sql --config wrangler.mali.toml`
Expected: Confirms the three tables (`shipments`, `orders`, `inventory`) were created.

- [ ] **Step 4: Set admin auth secrets**

Ask the user for (or generate) a Mali-specific admin password, then run, entering it when prompted:

```bash
cd backend
npx wrangler secret put ADMIN_PASSWORD --config wrangler.mali.toml
```

This must be a different value from Cameroon's `ADMIN_PASSWORD` secret — reusing it would let one login cookie/session authenticate against both backends' intent, even though the cookies themselves are per-origin.

- [ ] **Step 5: Deploy**

Run: `cd backend && npm run deploy:mali`
Expected: Output includes the deployed URL, `https://camaroom-cart-backend-mali.<your-subdomain>.workers.dev`.

- [ ] **Step 6: Smoke-test the live deployment**

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://camaroom-cart-backend-mali.<your-subdomain>.workers.dev/api/inventory
```

Expected: `HTTP 200`.

```bash
curl -s -X POST https://camaroom-cart-backend-mali.<your-subdomain>.workers.dev/api/orders \
  -H 'content-type: application/json' \
  -d '{"customer_name":"Test","customer_phone":"+22376000000","items":[{"sku":"test-sku","name":"Test Item","qty":1}],"currency":"XOF"}'
```

Expected: `201` with a JSON body containing an `id` matching `REST-XXXXXX` and a `created_at` timestamp — confirms the live Worker is using `ORDER_CURRENCY = "XOF"` end to end, not just in tests.

- [ ] **Step 7: Commit the filled-in database_id**

```bash
cd /Users/lucasfeng/camaroom-web
git add backend/wrangler.mali.toml
git commit -m "Fill in real D1 database_id for Mali backend after provisioning"
```

---

### Task 5: Point the Mali storefront at the new backend

**Files:**
- Modify: `/Users/lucasfeng/Mali-website/index.html` (separate git repo from camaroom-web)

**Interfaces:**
- Consumes: the live Mali Worker URL from Task 4 Step 5.

- [ ] **Step 1: Update the two config lines**

In `/Users/lucasfeng/Mali-website/index.html`, find:

```javascript
const CART_ENABLED = false;
```

replace with:

```javascript
const CART_ENABLED = true;
```

Find:

```javascript
window.CART_API_BASE = '';
```

replace with (using the actual URL from Task 4):

```javascript
window.CART_API_BASE = 'https://camaroom-cart-backend-mali.<your-subdomain>.workers.dev';
```

- [ ] **Step 2: Verify locally**

```bash
cd /Users/lucasfeng/Mali-website
python3 -m http.server 8899
```

Open `http://127.0.0.1:8899/index.html`, confirm "Add to cart" buttons now render on product cards (they were hidden while `CART_ENABLED` was `false` — see `index.html:777` in camaroom-web for the conditional that gates the button), and that the cart drawer opens without a JS console error (`CART_API_BASE` now points at a real Worker instead of an empty string).

- [ ] **Step 3: Commit and push**

```bash
cd /Users/lucasfeng/Mali-website
git add index.html
git commit -m "Enable cart checkout, point at the deployed Mali cart backend"
git push
```

(Confirm with the user before this push — it's a different repo than camaroom-web, and pushing here immediately updates the live GitHub Pages site.)

---

### Task 6: End-to-end verification of the full Mali order flow

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Submit a test order through the live storefront**

On the deployed Mali site (or local `python3 -m http.server` copy from Task 5), add an item to cart, fill in the order form, and submit. Confirm the request goes to `POST https://camaroom-cart-backend-mali.<subdomain>.workers.dev/api/orders` (check the Network tab) and returns `201`.

- [ ] **Step 2: Quote the order as the sales rep**

Visit `https://camaroom-cart-backend-mali.<subdomain>.workers.dev/admin/quote/<order-id>` (the order ID from Step 1), log in with the Mali `ADMIN_PASSWORD` set in Task 4 Step 4, enter a price, and confirm the page renders transfer instructions containing `XOF`, the placeholder MoMo number, and `Orange Money or Moov Money` (not `MTN Mobile Money`).

- [ ] **Step 3: Mark it paid**

Click "Mark as paid," confirm the page reloads showing `Paid at: <timestamp>`.

- [ ] **Step 4: Confirm Cameroon is unaffected**

```bash
curl -s -X POST https://camaroom-cart-backend.zhixuanlucasfeng.workers.dev/api/orders \
  -H 'content-type: application/json' \
  -d '{"customer_name":"Regression Check","customer_phone":"+237600000099","items":[{"sku":"panel-450w","name":"450W Panel","qty":1}],"currency":"XAF"}'
```

Expected: still `201` with an `XAF` order accepted — confirms Task 1's env-driven currency change didn't break Cameroon's existing `ORDER_CURRENCY = "XAF"` deployment.

- [ ] **Step 5: Report the outstanding placeholder to the user**

At the end of this task, explicitly tell the user (do not silently finish): the Mali `MOMO_TRANSFER_NUMBER`/`MOMO_ACCOUNT_NAME` are still Cameroon's real values and must be replaced with a real Mali Orange Money/Moov Money number before any real customer is given these payment instructions — same flag as in the design spec's decisions log.
