# Manual MoMo/Orange Money Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Flutterwave payment-link/webhook flow in the camaroom-web cart backend with a manual MTN MoMo/Orange Money transfer flow, confirmed by a sales rep clicking "Mark as paid" on the existing per-order admin page, eliminating third-party payment fees.

**Architecture:** The Cloudflare Worker backend keeps its existing order lifecycle (`submitted` -> `quoted` -> `paid`) but `quoted` no longer generates a Flutterwave payment link — it just records the price. A new authenticated `POST /api/orders/:id/mark-paid` route lets the sales rep transition `quoted` -> `paid` by hand after seeing the transfer land in their own MoMo/OM app, reusing the order's own ID as the transfer reference. All Flutterwave-specific code (`flutterwave.js`, `webhook.js`, the webhook route, the `payment_link`/`flutterwave_tx_ref` columns) is deleted outright, not kept dormant.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Vitest with `@cloudflare/vitest-pool-workers`.

## Global Constraints

- This plan only touches `backend/src/`, `backend/test/`, `backend/schema.sql`, `backend/wrangler.toml`, and `assets/js/cart.js` — `scripts/generate_country_site.py`'s cart-gating logic for Nigeria/Mali/Sudan is unaffected and needs no changes.
- Card/USD payments are out of scope — this plan removes that path entirely rather than keeping it dormant (per design decision log).
- The D1 database has never been deployed with real data, so schema changes are direct edits to `schema.sql`, not migrations.
- Every test file in `backend/test/` keeps its own inline copy of the orders table schema in sync with `backend/schema.sql` (existing project convention) — any task that changes `schema.sql` must update every inline copy in the same task.

---

### Task 1: Restrict order currency to XAF only

**Files:**
- Modify: `backend/src/orders.js`
- Modify: `backend/test/orders.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createOrder()` now rejects `currency !== 'XAF'` (previously allowed `'XAF'` or `'USD'`). No signature change.

- [ ] **Step 1: Write the failing test**

In `backend/test/orders.test.js`, replace the existing `'rejects a currency that is not XAF or USD'` test with:

```js
  it('rejects a currency that is not XAF', async () => {
    await expect(
      createOrder(env.DB, {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
        currency: 'EUR',
      })
    ).rejects.toThrow('invalid_currency');
  });

  it('rejects USD now that card payments are out of scope', async () => {
    await expect(
      createOrder(env.DB, {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
        currency: 'USD',
      })
    ).rejects.toThrow('invalid_currency');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- orders.test.js`
Expected: FAIL on `'rejects USD now that card payments are out of scope'` — `createOrder` does not throw for `currency: 'USD'`.

- [ ] **Step 3: Implement the minimal change**

In `backend/src/orders.js`, change:

```js
  if (currency !== 'XAF' && currency !== 'USD') {
    throw new Error('invalid_currency');
  }
```

to:

```js
  if (currency !== 'XAF') {
    throw new Error('invalid_currency');
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- orders.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/orders.js test/orders.test.js
git commit -m "Restrict cart orders to XAF currency now that card payments are out of scope"
```

---

### Task 2: Replace Flutterwave quoting with manual-transfer quoting

**Files:**
- Modify: `backend/src/quote.js`
- Modify: `backend/schema.sql`
- Modify: `backend/test/quote.test.js`
- Modify: `backend/test/orders.test.js` (inline schema copy)
- Modify: `backend/test/cors.test.js` (inline schema copy)
- Delete: `backend/src/flutterwave.js`
- Delete: `backend/src/webhook.js`
- Delete: `backend/test/webhook.test.js`
- Modify: `backend/src/index.js` (remove the webhook route and import)
- Modify: `backend/wrangler.toml` (add MoMo config vars)

**Interfaces:**
- Consumes: `getOrder(db, id)` from `orders.js` (unchanged).
- Produces: `submitQuote(db, env, id, price)` now returns `{ id, status, quoted_price }` (previously `{ id, payment_link, status }`) and no longer touches Flutterwave or the `payment_link`/`flutterwave_tx_ref` columns. `handleSubmitQuote` keeps its existing signature and error-status mapping. Task 3 (`markOrderPaid`) is added to this same file in the next task and will import `getOrder` and `sendPaidNotification` the same way `webhook.js` used to.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `backend/test/quote.test.js` with:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder, getOrder } from '../src/orders.js';
import { submitQuote } from '../src/quote.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT);';

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
});

async function makeOrder() {
  return createOrder(env.DB, {
    customer_name: 'Jean',
    customer_phone: '+237600000001',
    items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
    currency: 'XAF',
  });
}

describe('submitQuote', () => {
  it('sets the price and moves the order to quoted', async () => {
    const { id } = await makeOrder();

    const result = await submitQuote(env.DB, env, id, 150000);

    expect(result.status).toBe('quoted');
    expect(result.quoted_price).toBe(150000);
    const stored = await getOrder(env.DB, id);
    expect(stored.status).toBe('quoted');
    expect(stored.quoted_price).toBe(150000);
  });

  it('rejects a non-positive price', async () => {
    const { id } = await makeOrder();
    await expect(submitQuote(env.DB, env, id, 0)).rejects.toThrow('invalid_price');
  });

  it('throws order_not_found for an unknown id', async () => {
    await expect(submitQuote(env.DB, env, 'ord_doesnotexist', 1000)).rejects.toThrow('order_not_found');
  });

  it('is idempotent: quoting an already-quoted order keeps the original price', async () => {
    const { id } = await makeOrder();

    const first = await submitQuote(env.DB, env, id, 150000);
    const second = await submitQuote(env.DB, env, id, 999999);

    expect(second.quoted_price).toBe(first.quoted_price);
    expect(second.quoted_price).toBe(150000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- quote.test.js`
Expected: FAIL — `submitQuote` still calls Flutterwave and returns `payment_link`, not `quoted_price`; also `env.DB.exec(schema)` will fail if run against the still-unchanged `schema.sql`-derived table from other test files in the same run, but per-file `beforeEach` creates its own table so this file alone fails on the assertion, e.g. `expected undefined to be 150000`.

- [ ] **Step 3: Implement the minimal change**

Replace the entire contents of `backend/src/quote.js` with:

```js
import { getOrder } from './orders.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export async function submitQuote(db, env, id, price) {
  if (!Number.isInteger(price) || price <= 0) {
    throw new Error('invalid_price');
  }
  const order = await getOrder(db, id);
  if (!order) {
    throw new Error('order_not_found');
  }
  if (order.status !== 'submitted') {
    return { id: order.id, status: order.status, quoted_price: order.quoted_price };
  }

  await db
    .prepare(`UPDATE orders SET quoted_price = ?, status = 'quoted' WHERE id = ?`)
    .bind(price, order.id)
    .run();

  return { id: order.id, status: 'quoted', quoted_price: price };
}

export async function handleSubmitQuote(request, env, id) {
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
    const result = await submitQuote(env.DB, env, id, body.price);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err.message === 'order_not_found' ? 404 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function handleGetQuotePage(request, env, id) {
  const order = await getOrder(env.DB, id);
  if (!order) {
    return new Response('Order not found', { status: 404 });
  }
  const items = JSON.parse(order.items);
  const itemsHtml = items
    .map((i) => `<li>${escapeHtml(i.qty)} x ${escapeHtml(i.name)}</li>`)
    .join('');
  const digitsOnlyPhone = order.customer_phone.replace(/[^0-9]/g, '');
  const momoNumber = escapeHtml(env.MOMO_TRANSFER_NUMBER || '');
  const momoName = escapeHtml(env.MOMO_ACCOUNT_NAME || '');

  let actionHtml;
  if (order.status === 'submitted') {
    actionHtml = `
      <form id="quoteForm">
        <input type="number" id="price" placeholder="Price in ${escapeHtml(order.currency)}" required>
        <button type="submit">Save price and get transfer instructions</button>
      </form>
      <p id="result"></p>
      <script>
        document.getElementById('quoteForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var price = parseInt(document.getElementById('price').value, 10);
          fetch('/api/orders/${order.id}/quote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ price: price }),
          })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              var resultEl = document.getElementById('result');
              if (data.quoted_price) {
                var instructions = 'Please send ' + data.quoted_price + ' ${escapeHtml(order.currency)} via MTN Mobile Money or Orange Money to ${momoNumber} (${momoName}). Include order ' + data.id + ' as the transfer note/reference.';
                var waText = encodeURIComponent(instructions);
                var waUrl = 'https://wa.me/${digitsOnlyPhone}?text=' + waText;
                resultEl.innerHTML =
                  '<p>' + instructions + '</p>' +
                  '<a href="' + waUrl + '" target="_blank">Send via WhatsApp</a><br>' +
                  '<button id="markPaidBtn" type="button">Mark as paid</button>';
                document.getElementById('markPaidBtn').addEventListener('click', function () {
                  fetch('/api/orders/${order.id}/mark-paid', { method: 'POST' })
                    .then(function () { window.location.reload(); });
                });
              } else {
                resultEl.textContent = 'Error: ' + data.error;
              }
            });
        });
      </script>`;
  } else if (order.status === 'quoted') {
    const instructions = `Please send ${order.quoted_price} ${escapeHtml(order.currency)} via MTN Mobile Money or Orange Money to ${momoNumber} (${momoName}). Include order ${escapeHtml(order.id)} as the transfer note/reference.`;
    const waText = encodeURIComponent(instructions);
    const waUrl = `https://wa.me/${digitsOnlyPhone}?text=${waText}`;
    actionHtml = `
      <p>${instructions}</p>
      <a href="${waUrl}" target="_blank">Send via WhatsApp</a><br>
      <button id="markPaidBtn" type="button">Mark as paid</button>
      <p id="result"></p>
      <script>
        document.getElementById('markPaidBtn').addEventListener('click', function () {
          fetch('/api/orders/${order.id}/mark-paid', { method: 'POST' })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (data.status === 'paid') {
                window.location.reload();
              } else {
                document.getElementById('result').textContent = 'Error: ' + data.error;
              }
            });
        });
      </script>`;
  } else {
    actionHtml = `<p>Paid at: ${escapeHtml(order.paid_at || '')}</p>`;
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Quote order ${escapeHtml(order.id)}</title></head>
<body>
<h1>Order ${escapeHtml(order.id)}</h1>
<p>Customer: ${escapeHtml(order.customer_name)} (${escapeHtml(order.customer_phone)})</p>
<p>Currency: ${escapeHtml(order.currency)}</p>
<ul>${itemsHtml}</ul>
<p>Status: ${escapeHtml(order.status)}</p>
${actionHtml}
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html' } });
}
```

Note: `markOrderPaid` and `handleMarkOrderPaid` are intentionally NOT in this version yet — Task 3 adds them to this same file. Running quote.test.js now only exercises `submitQuote`.

In `backend/schema.sql`, replace the file contents with:

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  quoted_price INTEGER,
  paid_at TEXT
);
```

In `backend/test/orders.test.js`, update the inline schema constant to:

```js
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT);';
```

In `backend/test/cors.test.js`, update the inline schema constant the same way:

```js
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT);';
```

Delete the two Flutterwave-only files and the now-obsolete webhook test:

```bash
cd backend
rm src/flutterwave.js src/webhook.js test/webhook.test.js
```

In `backend/src/index.js`, remove the webhook import and route. Change:

```js
import { handleCreateOrder } from './orders.js';
import { handleGetQuotePage, handleSubmitQuote } from './quote.js';
import { isAuthenticated, checkPassword, makeSessionCookie } from './auth.js';
import { handleFlutterwaveWebhook } from './webhook.js';
```

to:

```js
import { handleCreateOrder } from './orders.js';
import { handleGetQuotePage, handleSubmitQuote } from './quote.js';
import { isAuthenticated, checkPassword, makeSessionCookie } from './auth.js';
```

and remove this block entirely:

```js
    if (pathname === '/api/webhook/flutterwave' && request.method === 'POST') {
      return handleFlutterwaveWebhook(request, env);
    }
```

In `backend/wrangler.toml`, add a `[vars]` section (these are public-facing values shown to customers in transfer instructions, not secrets, so plain `[vars]` — not `.dev.vars` — is correct):

```toml
name = "camaroom-cart-backend"
main = "src/index.js"
compatibility_date = "2024-11-01"

[vars]
MOMO_TRANSFER_NUMBER = "681105611"
MOMO_ACCOUNT_NAME = "su jiangmin"

[[d1_databases]]
binding = "DB"
database_name = "camaroom-orders"
database_id = "placeholder-local-db-id"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS for `quote.test.js`, `orders.test.js`, `cors.test.js`, `auth.test.js`. No `webhook.test.js` in the run (deleted).

- [ ] **Step 5: Commit**

```bash
cd backend
git add -A
git commit -m "Replace Flutterwave payment links with manual MoMo/OM transfer instructions"
```

---

### Task 3: Add markOrderPaid and the authenticated mark-paid route

**Files:**
- Modify: `backend/src/quote.js`
- Modify: `backend/test/quote.test.js`
- Modify: `backend/src/index.js`
- Modify: `backend/test/cors.test.js`

**Interfaces:**
- Consumes: `getOrder(db, id)` from `orders.js`, `sendPaidNotification(order, env)` from `email.js` (unchanged signature, previously used by the now-deleted `webhook.js`).
- Produces: `markOrderPaid(db, env, id)` returns `{ id, status: 'paid', paid_at }` on success; throws `'order_not_found'` or `'order_not_quoted'`. `handleMarkOrderPaid(request, env, id)` returns a `Response`. Route: authenticated `POST /api/orders/:id/mark-paid`.

- [ ] **Step 1: Write the failing test**

Add to the top of `backend/test/quote.test.js`, change the imports and `beforeEach` to:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder, getOrder } from '../src/orders.js';
import { submitQuote, markOrderPaid } from '../src/quote.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT);';

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
  env.RESEND_API_KEY = 'test_resend_key';
  env.NOTIFICATION_FROM_EMAIL = 'orders@restarsolar.com';
  env.SALES_NOTIFICATION_EMAIL = 'sales@restarsolar.com';
});
```

Then append this new describe block at the end of the file:

```js

describe('markOrderPaid', () => {
  it('marks a quoted order paid and sends a notification', async () => {
    const { id } = await makeOrder();
    await submitQuote(env.DB, env, id, 150000);
    const emailFetchMock = vi.fn(async () => ({ json: async () => ({ id: 'email_1' }) }));
    vi.stubGlobal('fetch', emailFetchMock);

    const result = await markOrderPaid(env.DB, env, id);

    expect(result.status).toBe('paid');
    expect(result.paid_at).toBeTruthy();
    const stored = await getOrder(env.DB, id);
    expect(stored.status).toBe('paid');
    expect(emailFetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects marking a submitted (not yet quoted) order as paid', async () => {
    const { id } = await makeOrder();
    await expect(markOrderPaid(env.DB, env, id)).rejects.toThrow('order_not_quoted');
  });

  it('throws order_not_found for an unknown id', async () => {
    await expect(markOrderPaid(env.DB, env, 'ord_doesnotexist')).rejects.toThrow('order_not_found');
  });

  it('is idempotent: marking an already-paid order paid again does not resend the notification', async () => {
    const { id } = await makeOrder();
    await submitQuote(env.DB, env, id, 150000);
    const emailFetchMock = vi.fn(async () => ({ json: async () => ({ id: 'email_1' }) }));
    vi.stubGlobal('fetch', emailFetchMock);

    await markOrderPaid(env.DB, env, id);
    const second = await markOrderPaid(env.DB, env, id);

    expect(second.status).toBe('paid');
    expect(emailFetchMock).toHaveBeenCalledTimes(1);
  });

  it('still marks the order paid when the email notification fails', async () => {
    const { id } = await makeOrder();
    await submitQuote(env.DB, env, id, 150000);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Resend API is down'); }));

    const result = await markOrderPaid(env.DB, env, id);

    expect(result.status).toBe('paid');
    const stored = await getOrder(env.DB, id);
    expect(stored.status).toBe('paid');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- quote.test.js`
Expected: FAIL — `markOrderPaid` is not exported from `../src/quote.js`.

- [ ] **Step 3: Implement the minimal change**

In `backend/src/quote.js`, add this import at the top (alongside the existing `getOrder` import):

```js
import { sendPaidNotification } from './email.js';
```

Add these two functions at the end of the file:

```js
export async function markOrderPaid(db, env, id) {
  const order = await getOrder(db, id);
  if (!order) {
    throw new Error('order_not_found');
  }
  if (order.status === 'paid') {
    return { id: order.id, status: 'paid', paid_at: order.paid_at };
  }
  if (order.status !== 'quoted') {
    throw new Error('order_not_quoted');
  }

  const paid_at = new Date().toISOString();
  await db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").bind(paid_at, id).run();

  try {
    await sendPaidNotification({ ...order, status: 'paid', paid_at }, env);
  } catch (err) {
    console.error('sendPaidNotification failed for order', order.id, err);
  }

  return { id: order.id, status: 'paid', paid_at };
}

export async function handleMarkOrderPaid(request, env, id) {
  try {
    const result = await markOrderPaid(env.DB, env, id);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err.message === 'order_not_found' ? 404 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
```

In `backend/src/index.js`, change the import:

```js
import { handleGetQuotePage, handleSubmitQuote } from './quote.js';
```

to:

```js
import { handleGetQuotePage, handleSubmitQuote, handleMarkOrderPaid } from './quote.js';
```

and add this route block right after the existing `quoteApiMatch` block:

```js
    const markPaidMatch = pathname.match(/^\/api\/orders\/([^/]+)\/mark-paid$/);
    if (markPaidMatch && request.method === 'POST') {
      if (!(await isAuthenticated(request, env))) {
        return new Response('Unauthorized', { status: 401 });
      }
      return handleMarkOrderPaid(request, env, markPaidMatch[1]);
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- quote.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Add route-level CORS/auth regression coverage and verify the full suite**

In `backend/test/cors.test.js`, add this test inside the existing `describe('CORS on POST /api/orders', ...)` block (it documents that the new route is authenticated and not CORS-enabled, following the same pattern as the existing `/api/orders/:id/quote` test):

```js
  it('does not add CORS headers to /api/orders/:id/mark-paid (a different, authenticated route)', async () => {
    const request = new Request('https://example.com/api/orders/ord_doesnotexist/mark-paid', {
      method: 'POST',
    });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
```

Run: `cd backend && npm test`
Expected: PASS, all test files green.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/quote.js src/index.js test/quote.test.js test/cors.test.js
git commit -m "Add manual mark-paid endpoint for MoMo/OM transfer confirmation"
```

---

### Task 4: Simplify the storefront cart contact form to XAF-only

**Files:**
- Modify: `assets/js/cart.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `submitOrder()` is always called with `currency: 'XAF'`; no behavior change to `window.Cart`'s public API (`add`, `remove`, `list`, `clear`, `count`, `renderDrawer`).

- [ ] **Step 1: Make the change**

In `assets/js/cart.js`, find `renderContactForm` and change:

```js
  function renderContactForm(drawer) {
    drawer.innerHTML =
      '<form id="cart-contact-form">' +
      '<input id="cart-name" placeholder="Name" required>' +
      '<input id="cart-phone" placeholder="WhatsApp number (with country code)" required>' +
      '<select id="cart-currency"><option value="XAF">XAF (Mobile Money)</option><option value="USD">USD (Card)</option></select>' +
      '<button type="submit" class="btn btn--sun">Submit</button>' +
      '</form><p id="cart-submit-error"></p>';

    document.getElementById('cart-contact-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitOrder({
        customer_name: document.getElementById('cart-name').value,
        customer_phone: document.getElementById('cart-phone').value,
        currency: document.getElementById('cart-currency').value,
        items: items,
      });
    });
  }
```

to:

```js
  function renderContactForm(drawer) {
    drawer.innerHTML =
      '<form id="cart-contact-form">' +
      '<input id="cart-name" placeholder="Name" required>' +
      '<input id="cart-phone" placeholder="WhatsApp number (with country code)" required>' +
      '<button type="submit" class="btn btn--sun">Submit</button>' +
      '</form><p id="cart-submit-error"></p>';

    document.getElementById('cart-contact-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitOrder({
        customer_name: document.getElementById('cart-name').value,
        customer_phone: document.getElementById('cart-phone').value,
        currency: 'XAF',
        items: items,
      });
    });
  }
```

- [ ] **Step 2: Manually verify in a real browser**

This is plain browser JS with no existing unit-test harness (consistent with how the original cart UI task was verified — see the `cameroon-cart-checkout` plan's Task 4). Verification happens in Task 5's end-to-end pass below, not here in isolation.

- [ ] **Step 3: Commit**

```bash
git add assets/js/cart.js
git commit -m "Drop USD/card currency option from the cart contact form"
```

---

### Task 5: Full-suite run and end-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Install backend dependencies**

This worktree has no `node_modules` yet (git worktrees don't share untracked/gitignored files).

Run: `cd backend && npm install`
Expected: installs `@cloudflare/vitest-pool-workers`, `vitest`, `wrangler` per `package-lock.json`.

- [ ] **Step 2: Run the full automated test suite**

Run: `cd backend && npm test`
Expected: PASS — `auth.test.js`, `cors.test.js`, `orders.test.js`, `quote.test.js` all green, no `webhook.test.js` (deleted in Task 2).

- [ ] **Step 3: Create local dev secrets for manual verification**

Create `backend/.dev.vars` (already gitignored, will not be committed):

```
ADMIN_PASSWORD=local-dev-password
RESEND_API_KEY=test-key-for-local-verification
NOTIFICATION_FROM_EMAIL=orders@restarsolar.com
SALES_NOTIFICATION_EMAIL=sales@restarsolar.com
```

- [ ] **Step 4: Start the Worker locally**

Run: `cd backend && npx wrangler dev` (leave running in the background)
Expected: starts on `http://localhost:8787`, logs "Ready on ...".

- [ ] **Step 5: Submit a test order**

Run:

```bash
curl -s -X POST http://localhost:8787/api/orders \
  -H 'content-type: application/json' \
  -d '{"customer_name":"Jean","customer_phone":"+237600000001","currency":"XAF","items":[{"sku":"panel-450w","name":"450W Panel","qty":2}]}'
```

Expected: `201` with a JSON body like `{"id":"ord_...","created_at":"..."}`. Note the `id`.

- [ ] **Step 6: Log in as admin and quote the order**

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:8787/admin/login \
  -H 'content-type: application/json' \
  -d '{"password":"local-dev-password"}'

curl -s -b /tmp/cookies.txt -X POST http://localhost:8787/api/orders/ORDER_ID/quote \
  -H 'content-type: application/json' \
  -d '{"price":150000}'
```

(Replace `ORDER_ID` with the id from Step 5.)
Expected: the quote request returns `{"id":"ord_...","status":"quoted","quoted_price":150000}`.

- [ ] **Step 7: View the admin quote page in a browser**

Open `http://localhost:8787/admin/quote/ORDER_ID` in a browser that has the `admin_session` cookie set (or log in via the page's own form). Confirm the page shows: "Please send 150000 XAF via MTN Mobile Money or Orange Money to 681105611 (su jiangmin). Include order ORDER_ID as the transfer note/reference." along with a working "Send via WhatsApp" link and a "Mark as paid" button.

- [ ] **Step 8: Click "Mark as paid" and confirm the transition**

Click the button, confirm the page reloads and now shows "Paid at: ...". Then verify directly:

```bash
curl -s -b /tmp/cookies.txt http://localhost:8787/admin/quote/ORDER_ID | grep -o 'Paid at: [^<]*'
```

Expected: a non-empty timestamp.

- [ ] **Step 9: Confirm the mark-paid endpoint is idempotent**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:8787/api/orders/ORDER_ID/mark-paid
```

Expected: `200` with `{"id":"ord_...","status":"paid","paid_at":"..."}` (same `paid_at` as before, not a new one).

- [ ] **Step 10: Confirm unauthenticated mark-paid is rejected**

```bash
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8787/api/orders/ORDER_ID/mark-paid
```

Expected: `401`.

- [ ] **Step 11: Stop wrangler dev**

Stop the background process started in Step 4.

- [ ] **Step 12: Update the progress ledger**

Append to `.superpowers/sdd/progress.md` (create the `# Progress Ledger - Manual MoMo/Orange Money Payment` section if the file doesn't yet track this plan) a summary of what was verified in Steps 1-10, noting any deviations.

- [ ] **Step 13: Commit the ledger update**

```bash
git add .superpowers/sdd/progress.md
git commit -m "Record manual verification of the MoMo/OM manual-transfer payment flow"
```

---

## Deployment Note (not a task — do this once, outside this plan, when going live)

This plan builds and locally verifies the feature against Miniflare's simulated D1. The
Worker has never been deployed with real Cloudflare infrastructure —
`backend/wrangler.toml`'s `database_id` is still `"placeholder-local-db-id"`. Production
rollout needs, separately, in order:

1. `cd backend && npx wrangler login` — requires the real Cloudflare account owner to
   approve in their own browser; nobody else can do this step.
2. `cd backend && npx wrangler d1 create camaroom-orders` — prints a real database UUID.
   Copy it into `backend/wrangler.toml`, replacing `"placeholder-local-db-id"`.
3. `cd backend && npx wrangler d1 execute camaroom-orders --remote --file=schema.sql` —
   applies the current (post-Flutterwave-removal) schema to the real D1 database. Note
   this schema has no `payment_link`/`flutterwave_tx_ref` columns — if an earlier,
   pre-this-plan D1 database already exists with those columns from a previous deploy
   attempt, drop and recreate it rather than trying to migrate, since it has never held
   real order data.
4. `cd backend && npx wrangler secret put ADMIN_PASSWORD` (and the same for
   `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SALES_NOTIFICATION_EMAIL`) — real
   values, not the local dev placeholders. `MOMO_TRANSFER_NUMBER` and
   `MOMO_ACCOUNT_NAME` do NOT need `secret put` — they're already committed as plain
   `[vars]` in `wrangler.toml` since they're customer-facing, not credentials.
   (Flutterwave's `FLUTTERWAVE_SECRET_KEY`/`FLUTTERWAVE_WEBHOOK_SECRET`/
   `PAYMENT_REDIRECT_URL` from the old deployment note are gone — this plan removed
   that dependency entirely.)
5. `cd backend && npm run deploy` (added in this plan) — get the Worker's real
   `*.workers.dev` URL (or a custom route once the `.cm` domain work happens).
6. Set `window.CART_API_BASE` in the deployed `index.html` to that URL, commit, push
   (GitHub Pages picks it up automatically).
7. Run one real end-to-end smoke test against the deployed Worker: submit a cart order
   from the live storefront, quote it from `/admin/quote/:id`, confirm the transfer
   instructions show the real MoMo number, click "Mark as paid", and confirm the
   archive email actually arrives at `SALES_NOTIFICATION_EMAIL` via the real Resend key
   (not just that the endpoint returns 200 — the email step is best-effort and fails
   silently by design, so a 200 response alone doesn't prove the email account works).
