# Cameroon Cart + Online Payment (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-item cart, a sales-facing price-quoting page, and Flutterwave-powered online payment (Mobile Money / card) to camaroom-web's Cameroon site, backed by a new Cloudflare Worker + D1 database — the project's first backend.

**Architecture:** A Cloudflare Worker (`backend/`) exposes `POST /api/orders` (cart submission), a password-protected `GET /admin/quote/:id` + `POST /api/orders/:id/quote` (sales sets price, generates a Flutterwave hosted payment link), and `POST /api/webhook/flutterwave` (payment confirmation). Orders live in one D1 table. The Cameroon site's frontend gets a new `assets/js/cart.js` module for cart state/UI, wired to the Worker.

**Tech Stack:** Cloudflare Workers (plain JavaScript, no TypeScript/bundler — matches this repo's existing no-build-step approach), Cloudflare D1, Vitest with `@cloudflare/vitest-pool-workers` for backend tests, Flutterwave v3 Standard payment API, Resend for transactional email.

## Global Constraints

- Cameroon only. `scripts/generate_country_site.py` must set the frontend cart feature flag to `false` for Nigeria/Mali/Sudan so regenerating those sites never ships a cart pointing at a backend they don't have.
- Currency is `XAF` or `USD` only (validated server-side); no other values accepted.
- No customer accounts — orders are identified by `id` + `customer_phone`, no login.
- No delivery/shipment tracking fields or states — order status is exactly `submitted` | `quoted` | `paid`.
- Sales auth is a single shared password (Worker secret `ADMIN_PASSWORD`), not a multi-user account system.
- New-order notification is a customer-initiated `wa.me` link (opened client-side, pre-filled, one tap to send) — no WhatsApp Business API.
- Payment-confirmed notification is an automated email via Resend — this is the one notification that can be fully server-automated.
- Payment integration is Flutterwave's hosted payment link (Standard v3 `/v3/payments` endpoint) — the site never collects or touches card/MoMo details directly.
- Backend code lives at `backend/` inside this repo (monorepo), plain ES module JavaScript, no build step.
- All money amounts are integers (XAF has no minor unit in practice; USD amounts are still stored/passed as whole units matching what Flutterwave's `amount` field expects — do not introduce a cents/centimes split, Flutterwave's API takes a plain decimal/integer amount).

---

## Task 1: Worker scaffold, D1 schema, and `POST /api/orders`

**Files:**
- Create: `backend/package.json`
- Create: `backend/wrangler.toml`
- Create: `backend/vitest.config.js`
- Create: `backend/schema.sql`
- Create: `backend/src/id.js`
- Create: `backend/src/orders.js`
- Create: `backend/src/index.js`
- Create: `backend/test/orders.test.js`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `generateOrderId(): string` (in `src/id.js`) — returns `"ord_" + 16 hex chars`.
- Produces: `createOrder(db, {customer_name, customer_phone, items, currency}): Promise<{id, created_at}>` (in `src/orders.js`) — throws `Error('invalid_order')` if `customer_name`/`customer_phone` missing or `items` empty/not-an-array; throws `Error('invalid_currency')` if `currency` isn't `'XAF'` or `'USD'`.
- Produces: `getOrder(db, id): Promise<object|null>` (in `src/orders.js`) — raw D1 row or `null`.
- Produces: `handleCreateOrder(request, env): Promise<Response>` (in `src/orders.js`) — the HTTP handler for `POST /api/orders`.
- Produces: `export default { fetch(request, env) }` (in `src/index.js`) — the Worker entrypoint; Task 1 wires only the `/api/orders` route, later tasks add more routes to this same file.

- [ ] **Step 1: Create the backend project files**

`backend/package.json`:
```json
{
  "name": "camaroom-cart-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.6.1",
    "vitest": "^2.1.4",
    "wrangler": "^3.90.0"
  }
}
```

`backend/wrangler.toml`:
```toml
name = "camaroom-cart-backend"
main = "src/index.js"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "camaroom-orders"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

`backend/schema.sql`:
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
  payment_link TEXT,
  flutterwave_tx_ref TEXT,
  paid_at TEXT
);
```

`backend/vitest.config.js`:
```js
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

Add to the repo root `.gitignore` (append, don't remove existing entries):
```
# Cart backend
backend/node_modules
backend/.wrangler
```

- [ ] **Step 2: Install dependencies**

Run: `cd backend && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create a local D1 database and apply the schema**

Run: `cd backend && npx wrangler d1 create camaroom-orders`
Expected output includes a `database_id` — copy it into `backend/wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

Run: `cd backend && npx wrangler d1 execute camaroom-orders --local --file=schema.sql`
Expected: `Executed N commands` with no errors.

- [ ] **Step 4: Write `src/id.js`**

```js
export function generateOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `ord_${hex}`;
}
```

- [ ] **Step 5: Write the failing test for `createOrder`**

`backend/test/orders.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import fs from 'node:fs';
import { createOrder, getOrder } from '../src/orders.js';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf-8');

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
});

describe('createOrder', () => {
  it('creates an order and returns its id', async () => {
    const result = await createOrder(env.DB, {
      customer_name: 'Jean',
      customer_phone: '+237600000001',
      items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
      currency: 'XAF',
    });

    expect(result.id).toMatch(/^ord_[0-9a-f]{16}$/);
    expect(result.created_at).toBeTruthy();

    const stored = await getOrder(env.DB, result.id);
    expect(stored.customer_name).toBe('Jean');
    expect(stored.status).toBe('submitted');
    expect(JSON.parse(stored.items)).toEqual([{ sku: 'panel-450w', name: '450W Panel', qty: 2 }]);
  });

  it('rejects an order with no items', async () => {
    await expect(
      createOrder(env.DB, {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [],
        currency: 'XAF',
      })
    ).rejects.toThrow('invalid_order');
  });

  it('rejects an order missing customer_phone', async () => {
    await expect(
      createOrder(env.DB, {
        customer_name: 'Jean',
        items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
        currency: 'XAF',
      })
    ).rejects.toThrow('invalid_order');
  });

  it('rejects a currency that is not XAF or USD', async () => {
    await expect(
      createOrder(env.DB, {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
        currency: 'EUR',
      })
    ).rejects.toThrow('invalid_currency');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `orders.js` does not exist yet (`Cannot find module '../src/orders.js'`).

- [ ] **Step 7: Implement `src/orders.js`**

```js
import { generateOrderId } from './id.js';

export async function createOrder(db, { customer_name, customer_phone, items, currency }) {
  if (!customer_name || !customer_phone || !Array.isArray(items) || items.length === 0) {
    throw new Error('invalid_order');
  }
  if (currency !== 'XAF' && currency !== 'USD') {
    throw new Error('invalid_currency');
  }
  const id = generateOrderId();
  const created_at = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO orders (id, created_at, customer_name, customer_phone, items, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted')`
    )
    .bind(id, created_at, customer_name, customer_phone, JSON.stringify(items), currency)
    .run();
  return { id, created_at };
}

export async function getOrder(db, id) {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return row || null;
}

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
    const order = await createOrder(env.DB, body);
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

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 4 tests in `orders.test.js`.

- [ ] **Step 9: Write `src/index.js` with the `/api/orders` route**

```js
import { handleCreateOrder } from './orders.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/orders' && request.method === 'POST') {
      return handleCreateOrder(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
```

- [ ] **Step 10: Manually verify locally**

Run: `cd backend && npx wrangler dev` (leave running)
In another terminal:
```bash
curl -s -X POST http://localhost:8787/api/orders \
  -H 'content-type: application/json' \
  -d '{"customer_name":"Jean","customer_phone":"+237600000001","items":[{"sku":"panel-450w","name":"450W Panel","qty":2}],"currency":"XAF"}'
```
Expected: `{"id":"ord_...","created_at":"..."}` with HTTP 201.

- [ ] **Step 11: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/wrangler.toml backend/vitest.config.js backend/schema.sql backend/src/id.js backend/src/orders.js backend/src/index.js backend/test/orders.test.js .gitignore
git commit -m "Add cart backend: Worker scaffold, D1 schema, POST /api/orders"
```

---

## Task 2: Sales auth, quoting page, and Flutterwave payment link generation

**Files:**
- Create: `backend/src/util.js`
- Create: `backend/src/auth.js`
- Create: `backend/src/flutterwave.js`
- Create: `backend/src/quote.js`
- Modify: `backend/src/index.js`
- Create: `backend/test/auth.test.js`
- Create: `backend/test/quote.test.js`

**Interfaces:**
- Consumes: `getOrder(db, id)` from `src/orders.js` (Task 1).
- Produces: `timingSafeEqual(a, b): boolean` (in `src/util.js`).
- Produces: `checkPassword(password, env): boolean`, `makeSessionCookie(env): Promise<string>`, `isAuthenticated(request, env): Promise<boolean>` (in `src/auth.js`).
- Produces: `createPaymentLink({amount, currency, txRef, customerName, customerPhone}, env): Promise<string>` (in `src/flutterwave.js`) — throws `Error('flutterwave_link_failed')` on API failure.
- Produces: `submitQuote(db, env, id, price): Promise<{id, payment_link, status}>` (in `src/quote.js`) — throws `Error('invalid_price')`, `Error('order_not_found')`; is idempotent for orders already `quoted`/`paid`.
- Produces: `handleSubmitQuote(request, env, id): Promise<Response>`, `handleGetQuotePage(request, env, id): Promise<Response>` (in `src/quote.js`).
- Consumes env secrets (set later at deploy time, referenced now): `env.ADMIN_PASSWORD`, `env.FLUTTERWAVE_SECRET_KEY`, `env.PAYMENT_REDIRECT_URL`.

- [ ] **Step 1: Write `src/util.js`**

```js
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

- [ ] **Step 2: Write the failing test for auth**

`backend/test/auth.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { checkPassword, makeSessionCookie, isAuthenticated } from '../src/auth.js';

beforeEach(() => {
  env.ADMIN_PASSWORD = 'test-shared-password';
});

describe('checkPassword', () => {
  it('accepts the correct password', () => {
    expect(checkPassword('test-shared-password', env)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    expect(checkPassword('wrong', env)).toBe(false);
  });
});

describe('makeSessionCookie / isAuthenticated', () => {
  it('a request carrying the cookie from makeSessionCookie is authenticated', async () => {
    const cookie = await makeSessionCookie(env);
    const cookieValue = cookie.split(';')[0];
    const request = new Request('https://example.com/admin/quote/ord_1', {
      headers: { cookie: cookieValue },
    });
    expect(await isAuthenticated(request, env)).toBe(true);
  });

  it('a request with no cookie is not authenticated', async () => {
    const request = new Request('https://example.com/admin/quote/ord_1');
    expect(await isAuthenticated(request, env)).toBe(false);
  });

  it('a request with a tampered cookie is not authenticated', async () => {
    const cookie = await makeSessionCookie(env);
    const cookieValue = cookie.split(';')[0];
    const tampered = cookieValue.replace('ok.', 'ok.tampered');
    const request = new Request('https://example.com/admin/quote/ord_1', {
      headers: { cookie: tampered },
    });
    expect(await isAuthenticated(request, env)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test -- auth.test.js`
Expected: FAIL — `Cannot find module '../src/auth.js'`.

- [ ] **Step 4: Implement `src/auth.js`**

```js
import { timingSafeEqual } from './util.js';

const COOKIE_NAME = 'admin_session';

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function checkPassword(password, env) {
  return typeof password === 'string' && timingSafeEqual(password, env.ADMIN_PASSWORD);
}

export async function makeSessionCookie(env) {
  const value = 'ok';
  const sig = await sign(value, env.ADMIN_PASSWORD);
  return `${COOKIE_NAME}=${value}.${sig}; HttpOnly; Secure; Path=/; Max-Age=86400; SameSite=Strict`;
}

export async function isAuthenticated(request, env) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const dotIndex = match[1].indexOf('.');
  if (dotIndex === -1) return false;
  const value = match[1].slice(0, dotIndex);
  const sig = match[1].slice(dotIndex + 1);
  const expectedSig = await sign(value, env.ADMIN_PASSWORD);
  return timingSafeEqual(sig, expectedSig);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- auth.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 6: Write `src/flutterwave.js`**

```js
export async function createPaymentLink({ amount, currency, txRef, customerName, customerPhone }, env) {
  const res = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: env.PAYMENT_REDIRECT_URL,
      customer: {
        name: customerName,
        phonenumber: customerPhone,
      },
      customizations: {
        title: 'Restar Solar Cameroon',
      },
    }),
  });
  const data = await res.json();
  if (data.status !== 'success' || !data.data || !data.data.link) {
    throw new Error('flutterwave_link_failed');
  }
  return data.data.link;
}
```

- [ ] **Step 7: Write the failing test for `submitQuote`**

`backend/test/quote.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import fs from 'node:fs';
import { createOrder } from '../src/orders.js';
import { submitQuote } from '../src/quote.js';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf-8');

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
  env.FLUTTERWAVE_SECRET_KEY = 'test_secret';
  env.PAYMENT_REDIRECT_URL = 'https://example.com/paid';
});

function mockFlutterwaveSuccess(link) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ status: 'success', data: { link } }) }))
  );
}

async function makeOrder() {
  return createOrder(env.DB, {
    customer_name: 'Jean',
    customer_phone: '+237600000001',
    items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
    currency: 'XAF',
  });
}

describe('submitQuote', () => {
  it('generates a payment link and moves the order to quoted', async () => {
    mockFlutterwaveSuccess('https://flutterwave.test/pay/abc123');
    const { id } = await makeOrder();

    const result = await submitQuote(env.DB, env, id, 150000);

    expect(result.status).toBe('quoted');
    expect(result.payment_link).toBe('https://flutterwave.test/pay/abc123');
  });

  it('rejects a non-positive price', async () => {
    mockFlutterwaveSuccess('https://flutterwave.test/pay/should-not-be-called');
    const { id } = await makeOrder();

    await expect(submitQuote(env.DB, env, id, 0)).rejects.toThrow('invalid_price');
  });

  it('throws order_not_found for an unknown id', async () => {
    mockFlutterwaveSuccess('https://flutterwave.test/pay/nope');
    await expect(submitQuote(env.DB, env, 'ord_doesnotexist', 1000)).rejects.toThrow('order_not_found');
  });

  it('is idempotent: quoting an already-quoted order returns the existing link without calling Flutterwave again', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ status: 'success', data: { link: 'https://flutterwave.test/pay/first' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { id } = await makeOrder();

    const first = await submitQuote(env.DB, env, id, 150000);
    const second = await submitQuote(env.DB, env, id, 999999);

    expect(second.payment_link).toBe(first.payment_link);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd backend && npm test -- quote.test.js`
Expected: FAIL — `Cannot find module '../src/quote.js'`.

- [ ] **Step 9: Implement `src/quote.js`**

```js
import { getOrder } from './orders.js';
import { createPaymentLink } from './flutterwave.js';

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
    return { id: order.id, payment_link: order.payment_link, status: order.status };
  }

  const tx_ref = `${order.id}_${Date.now()}`;
  const payment_link = await createPaymentLink(
    {
      amount: price,
      currency: order.currency,
      txRef: tx_ref,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
    },
    env
  );

  await db
    .prepare(
      `UPDATE orders SET quoted_price = ?, payment_link = ?, flutterwave_tx_ref = ?, status = 'quoted' WHERE id = ?`
    )
    .bind(price, payment_link, tx_ref, order.id)
    .run();

  return { id: order.id, payment_link, status: 'quoted' };
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

  let actionHtml;
  if (order.status === 'submitted') {
    actionHtml = `
      <form id="quoteForm">
        <input type="number" id="price" placeholder="Price in ${escapeHtml(order.currency)}" required>
        <button type="submit">Generate payment link</button>
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
              if (data.payment_link) {
                var waText = encodeURIComponent('Here is your payment link: ' + data.payment_link);
                var waUrl = 'https://wa.me/${digitsOnlyPhone}?text=' + waText;
                resultEl.innerHTML =
                  '<a href="' + data.payment_link + '" target="_blank">Payment link</a><br>' +
                  '<a href="' + waUrl + '" target="_blank">Send via WhatsApp</a>';
              } else {
                resultEl.textContent = 'Error: ' + data.error;
              }
            });
        });
      </script>`;
  } else {
    const link = escapeHtml(order.payment_link || '');
    actionHtml = `<p>Payment link: <a href="${link}">${link}</a></p>`;
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

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd backend && npm test -- quote.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 11: Wire the new routes into `src/index.js`**

Replace the full contents of `backend/src/index.js` with:
```js
import { handleCreateOrder } from './orders.js';
import { handleGetQuotePage, handleSubmitQuote } from './quote.js';
import { isAuthenticated, checkPassword, makeSessionCookie } from './auth.js';

const LOGIN_PAGE = `<!doctype html><html><body>
<form id="loginForm"><input type="password" id="pw" placeholder="Password"><button>Enter</button></form>
<script>
  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('pw').value }),
    }).then(function (res) {
      if (res.ok) { window.location.reload(); }
      else { alert('Wrong password'); }
    });
  });
</script>
</body></html>`;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/orders' && request.method === 'POST') {
      return handleCreateOrder(request, env);
    }

    const quoteApiMatch = pathname.match(/^\/api\/orders\/([^/]+)\/quote$/);
    if (quoteApiMatch && request.method === 'POST') {
      if (!(await isAuthenticated(request, env))) {
        return new Response('Unauthorized', { status: 401 });
      }
      return handleSubmitQuote(request, env, quoteApiMatch[1]);
    }

    if (pathname === '/admin/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!checkPassword(body.password, env)) {
        return new Response(JSON.stringify({ error: 'wrong_password' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'set-cookie': await makeSessionCookie(env), 'content-type': 'application/json' },
      });
    }

    const quotePageMatch = pathname.match(/^\/admin\/quote\/([^/]+)$/);
    if (quotePageMatch && request.method === 'GET') {
      if (!(await isAuthenticated(request, env))) {
        return new Response(LOGIN_PAGE, { status: 401, headers: { 'content-type': 'text/html' } });
      }
      return handleGetQuotePage(request, env, quotePageMatch[1]);
    }

    return new Response('Not found', { status: 404 });
  },
};
```

- [ ] **Step 12: Add local secrets for manual testing and verify end-to-end**

Create `backend/.dev.vars` (this file must NOT be committed — add it to `.gitignore` alongside the other `backend/` entries added in Task 1):
```
ADMIN_PASSWORD=local-dev-password
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-replace-with-real-sandbox-key
PAYMENT_REDIRECT_URL=http://localhost:8787/paid
```

Append to `.gitignore`:
```
backend/.dev.vars
```

Run: `cd backend && npx wrangler dev` (leave running), then in another terminal:
```bash
curl -s -i http://localhost:8787/admin/quote/ord_doesnotexist
```
Expected: HTTP 401 with the login page HTML (not authenticated yet).

- [ ] **Step 13: Commit**

```bash
git add backend/src/util.js backend/src/auth.js backend/src/flutterwave.js backend/src/quote.js backend/src/index.js backend/test/auth.test.js backend/test/quote.test.js .gitignore
git commit -m "Add sales auth, quoting page, and Flutterwave payment link generation"
```

---

## Task 3: Flutterwave webhook and payment-confirmed email notification

**Files:**
- Create: `backend/src/email.js`
- Create: `backend/src/webhook.js`
- Modify: `backend/src/index.js`
- Create: `backend/test/webhook.test.js`

**Interfaces:**
- Consumes: `getOrder`/order shape from `src/orders.js` (Task 1), `timingSafeEqual` from `src/util.js` (Task 2).
- Produces: `sendPaidNotification(order, env): Promise<void>` (in `src/email.js`).
- Produces: `handleFlutterwaveWebhook(request, env): Promise<Response>` (in `src/webhook.js`).
- Consumes env secrets (set at deploy time): `env.FLUTTERWAVE_WEBHOOK_SECRET`, `env.RESEND_API_KEY`, `env.NOTIFICATION_FROM_EMAIL`, `env.SALES_NOTIFICATION_EMAIL`.

- [ ] **Step 1: Write `src/email.js`**

```js
export async function sendPaidNotification(order, env) {
  const items = JSON.parse(order.items);
  const itemsText = items.map((i) => `${i.qty} x ${i.name}`).join(', ');
  const text =
    `Order ${order.id} paid.\n` +
    `Customer: ${order.customer_name} (${order.customer_phone})\n` +
    `Amount: ${order.quoted_price} ${order.currency}\n` +
    `Items: ${itemsText}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.NOTIFICATION_FROM_EMAIL,
      to: env.SALES_NOTIFICATION_EMAIL,
      subject: `Payment received — order ${order.id}`,
      text,
    }),
  });
}
```

- [ ] **Step 2: Write the failing test for the webhook**

`backend/test/webhook.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import fs from 'node:fs';
import { createOrder } from '../src/orders.js';
import { submitQuote } from '../src/quote.js';
import { handleFlutterwaveWebhook } from '../src/webhook.js';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf-8');

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
  env.FLUTTERWAVE_SECRET_KEY = 'test_secret';
  env.PAYMENT_REDIRECT_URL = 'https://example.com/paid';
  env.FLUTTERWAVE_WEBHOOK_SECRET = 'webhook_secret_123';
  env.RESEND_API_KEY = 'test_resend_key';
  env.NOTIFICATION_FROM_EMAIL = 'orders@restarsolar.com';
  env.SALES_NOTIFICATION_EMAIL = 'sales@restarsolar.com';
});

async function quotedOrder() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ status: 'success', data: { link: 'https://flutterwave.test/pay/xyz' } }) }))
  );
  const { id } = await createOrder(env.DB, {
    customer_name: 'Jean',
    customer_phone: '+237600000001',
    items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
    currency: 'XAF',
  });
  await submitQuote(env.DB, env, id, 150000);
  const row = await env.DB.prepare('SELECT flutterwave_tx_ref FROM orders WHERE id = ?').bind(id).first();
  return { id, tx_ref: row.flutterwave_tx_ref };
}

function webhookRequest(txRef, verifHash) {
  return new Request('https://example.com/api/webhook/flutterwave', {
    method: 'POST',
    headers: { 'verif-hash': verifHash },
    body: JSON.stringify({ data: { tx_ref: txRef, status: 'successful' } }),
  });
}

describe('handleFlutterwaveWebhook', () => {
  it('marks the order paid and sends a notification on a valid successful payment', async () => {
    const { id, tx_ref } = await quotedOrder();
    const emailFetchMock = vi.fn(async () => ({ json: async () => ({ id: 'email_1' }) }));
    vi.stubGlobal('fetch', emailFetchMock);

    const res = await handleFlutterwaveWebhook(webhookRequest(tx_ref, 'webhook_secret_123'), env);
    expect(res.status).toBe(200);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    expect(order.status).toBe('paid');
    expect(order.paid_at).toBeTruthy();
    expect(emailFetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with an invalid signature and does not change order state', async () => {
    const { tx_ref } = await quotedOrder();

    const res = await handleFlutterwaveWebhook(webhookRequest(tx_ref, 'wrong_secret'), env);
    expect(res.status).toBe(401);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE flutterwave_tx_ref = ?').bind(tx_ref).first();
    expect(order.status).toBe('quoted');
  });

  it('is idempotent: a duplicate webhook for an already-paid order does not resend the notification', async () => {
    const { tx_ref } = await quotedOrder();
    const emailFetchMock = vi.fn(async () => ({ json: async () => ({ id: 'email_1' }) }));
    vi.stubGlobal('fetch', emailFetchMock);

    await handleFlutterwaveWebhook(webhookRequest(tx_ref, 'webhook_secret_123'), env);
    const res2 = await handleFlutterwaveWebhook(webhookRequest(tx_ref, 'webhook_secret_123'), env);

    expect(res2.status).toBe(200);
    expect(emailFetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 and ignores a non-successful status without changing order state', async () => {
    const { tx_ref } = await quotedOrder();
    const request = new Request('https://example.com/api/webhook/flutterwave', {
      method: 'POST',
      headers: { 'verif-hash': 'webhook_secret_123' },
      body: JSON.stringify({ data: { tx_ref, status: 'failed' } }),
    });

    const res = await handleFlutterwaveWebhook(request, env);
    expect(res.status).toBe(200);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE flutterwave_tx_ref = ?').bind(tx_ref).first();
    expect(order.status).toBe('quoted');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test -- webhook.test.js`
Expected: FAIL — `Cannot find module '../src/webhook.js'`.

- [ ] **Step 4: Implement `src/webhook.js`**

```js
import { timingSafeEqual } from './util.js';
import { sendPaidNotification } from './email.js';

export async function handleFlutterwaveWebhook(request, env) {
  const signature = request.headers.get('verif-hash') || '';
  if (!env.FLUTTERWAVE_WEBHOOK_SECRET || !timingSafeEqual(signature, env.FLUTTERWAVE_WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  const txRef = payload?.data?.tx_ref;
  const status = payload?.data?.status;
  if (!txRef || status !== 'successful') {
    return new Response('Ignored', { status: 200 });
  }

  const order = await env.DB.prepare('SELECT * FROM orders WHERE flutterwave_tx_ref = ?').bind(txRef).first();
  if (!order) {
    return new Response('Order not found', { status: 404 });
  }
  if (order.status === 'paid') {
    return new Response('Already processed', { status: 200 });
  }

  const paid_at = new Date().toISOString();
  await env.DB
    .prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?")
    .bind(paid_at, order.id)
    .run();

  await sendPaidNotification({ ...order, status: 'paid', paid_at }, env);

  return new Response('OK', { status: 200 });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- webhook.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Wire the webhook route into `src/index.js`**

In `backend/src/index.js`, add the import:
```js
import { handleFlutterwaveWebhook } from './webhook.js';
```

And add this route inside `fetch()`, before the final `return new Response('Not found', { status: 404 });`:
```js
    if (pathname === '/api/webhook/flutterwave' && request.method === 'POST') {
      return handleFlutterwaveWebhook(request, env);
    }
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS — all tests across `orders.test.js`, `auth.test.js`, `quote.test.js`, `webhook.test.js`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/email.js backend/src/webhook.js backend/src/index.js backend/test/webhook.test.js
git commit -m "Add Flutterwave webhook handler and payment-confirmed email notification"
```

---

## Task 4: Cart state and UI on the Cameroon site (client-side only)

This task adds cart state management and a cart drawer to the live site, with no backend calls yet — it must work standalone (add/remove items, see the drawer update) before Task 5 wires it to the Worker.

**Files:**
- Create: `assets/js/cart.js`
- Modify: `index.html`

**Interfaces:**
- Produces (on `window`, from `assets/js/cart.js`): `Cart.add(item)`, `Cart.remove(sku)`, `Cart.list(): Array<{sku, name, qty}>`, `Cart.clear()`, `Cart.count(): number` — `item` shape is `{sku, name, qty}`. Persisted to `localStorage` under key `restar_cart` so the cart survives a page reload.
- Produces: `Cart.renderDrawer()` — re-renders the `#cart-drawer` contents from current state; called after every `add`/`remove`/`clear`.
- Consumes (Task 5): a global `window.CART_ENABLED` boolean, read by `cart.js` to decide whether to render the floating cart button at all.

- [ ] **Step 1: Locate the product card template and the site's script-loading pattern**

Run: `grep -n "renderGrid\|<script src=" index.html`

This repo's `index.html` is the single template shared by every country variant (Cameroon is the live default; `scripts/generate_country_site.py` derives Nigeria/Mali/Sudan from it). Note the line numbers `renderGrid` and the existing `<script src="...">` tags return — you'll add a new `<script src="assets/js/cart.js">` near the existing ones, and add an "Add to cart" button inside the card template `renderGrid` builds.

- [ ] **Step 2: Write `assets/js/cart.js`**

```js
(function () {
  var STORAGE_KEY = 'restar_cart';

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  var items = load();

  function add(item) {
    var existing = items.find(function (i) { return i.sku === item.sku; });
    if (existing) {
      existing.qty += item.qty || 1;
    } else {
      items.push({ sku: item.sku, name: item.name, qty: item.qty || 1 });
    }
    save(items);
    renderDrawer();
  }

  function remove(sku) {
    items = items.filter(function (i) { return i.sku !== sku; });
    save(items);
    renderDrawer();
  }

  function list() {
    return items.slice();
  }

  function clear() {
    items = [];
    save(items);
    renderDrawer();
  }

  function count() {
    return items.reduce(function (sum, i) { return sum + i.qty; }, 0);
  }

  function renderDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var countEl = document.getElementById('cart-count');
    if (countEl) countEl.textContent = String(count());
    if (!drawer) return;

    if (items.length === 0) {
      drawer.innerHTML = '<p class="cart-empty">Cart is empty</p>';
      return;
    }

    var rows = items
      .map(function (i) {
        return (
          '<li class="cart-row" data-sku="' + i.sku + '">' +
          '<span class="cart-row-name">' + i.name + '</span>' +
          '<span class="cart-row-qty">x' + i.qty + '</span>' +
          '<button class="cart-row-remove" data-sku="' + i.sku + '" type="button">&times;</button>' +
          '</li>'
        );
      })
      .join('');

    drawer.innerHTML =
      '<ul class="cart-list">' + rows + '</ul>' +
      '<button id="cart-submit" type="button" class="btn btn--sun">Request quote for cart</button>';

    drawer.querySelectorAll('.cart-row-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        remove(btn.getAttribute('data-sku'));
      });
    });
  }

  window.Cart = { add: add, remove: remove, list: list, clear: clear, count: count, renderDrawer: renderDrawer };

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('cart-toggle');
    if (window.CART_ENABLED && toggle) {
      toggle.style.display = '';
      toggle.addEventListener('click', function () {
        var drawer = document.getElementById('cart-drawer');
        drawer.classList.toggle('open');
      });
    }
    renderDrawer();
  });
})();
```

- [ ] **Step 3: Add the cart config flag near the site's existing `let lang` declaration**

Run: `grep -n "let lang = " index.html`

Immediately after that line, add:
```js
const CART_ENABLED = true;
window.CART_ENABLED = CART_ENABLED;
```

- [ ] **Step 4: Add the cart button, drawer container, and script tag**

Add this HTML directly after the opening `<body>` tag (find it with `grep -n "<body" index.html`):
```html
<button id="cart-toggle" style="display:none" aria-label="Cart">🛒 <span id="cart-count">0</span></button>
<div id="cart-drawer" class="cart-drawer"></div>
```

Add this `<style>` block addition just before `</style>` in the existing `<style>` section (find it with `grep -n "</style>" index.html` — there is exactly one, matching the pattern used for the earlier RTL override block):
```css
#cart-toggle{position:fixed;top:14px;right:14px;z-index:999;border:none;border-radius:999px;padding:8px 14px;background:#ff8a00;color:#fff;font-weight:600;cursor:pointer}
.cart-drawer{position:fixed;top:0;right:-320px;width:300px;height:100%;background:#fff;box-shadow:-2px 0 12px rgba(0,0,0,.15);padding:16px;overflow-y:auto;transition:right .2s ease;z-index:998}
.cart-drawer.open{right:0}
.cart-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
.cart-row-name{flex:1}
.cart-row-remove{border:none;background:none;font-size:18px;cursor:pointer;color:#999}
```

Add the script tag alongside the site's other `<script src="...">` tags (from Step 1's grep), before the closing `</body>`:
```html
<script src="assets/js/cart.js"></script>
```

- [ ] **Step 5: Add an "Add to cart" button to the product card template**

In the `renderGrid()` function found in Step 1, locate the template literal that builds each product card's HTML (it contains `<p class="desc">${tr(p.desc)}</p>` per this project's established i18n pattern). Add an "Add to cart" button inside that same card template, guarded so it only renders when the cart feature is on:

```js
(window.CART_ENABLED ? `<button class="btn btn--ghost add-to-cart" data-sku="${p.sku}" data-name="${(p.name || '').replace(/"/g, '&quot;')}" type="button">Add to cart</button>` : '')
```

Splice this string into the existing card template literal (next to the existing inquire/detail button in that same card). After `renderGrid()` finishes building the grid's HTML, wire up the new buttons — add this at the end of `renderGrid()`, after the grid's `innerHTML` is set:
```js
document.querySelectorAll('.add-to-cart').forEach(function (btn) {
  btn.addEventListener('click', function () {
    window.Cart.add({ sku: btn.getAttribute('data-sku'), name: btn.getAttribute('data-name'), qty: 1 });
  });
});
```

- [ ] **Step 6: Manually verify in the browser**

Run: `python3 -m http.server 8899` from the repo root, then open `http://localhost:8899/index.html`.

Verify:
1. A 🛒 button with count "0" appears top-right.
2. Clicking "Add to cart" on a product increments the count.
3. Clicking the 🛒 button opens the drawer showing the added item.
4. Clicking the row's `×` removes the item and the drawer updates.
5. Reloading the page preserves the cart (localStorage persistence).

- [ ] **Step 7: Commit**

```bash
git add assets/js/cart.js index.html
git commit -m "Add cart state and drawer UI to Cameroon site (client-side only)"
```

---

## Task 5: Wire the cart to the backend, and gate the feature for other countries

**Files:**
- Modify: `assets/js/cart.js`
- Modify: `index.html`
- Modify: `scripts/generate_country_site.py`

**Interfaces:**
- Consumes: `POST /api/orders` from `backend/src/orders.js` (Task 1).
- Consumes: the site's existing `AGENT_PHONE_2` variable (Luc Su's Cameroon WhatsApp number) — confirm its exact current name with `grep -n "AGENT_PHONE_2" index.html` before use; this is the number the rest of the site already uses for Cameroon-specific customer contact, and the cart's new-order notification should match that existing pattern rather than introducing a second contact number.
- Produces: `window.CART_API_BASE` — the Worker's origin, configurable so the deployed site can point at the production Worker URL once it exists (set to `''` for same-origin/local testing until the Worker has a real deployed URL to point at).

- [ ] **Step 1: Add the submit-to-backend flow in `assets/js/cart.js`**

In `assets/js/cart.js`, replace the `renderDrawer` function's submit button wiring (currently the button has id `cart-submit` but no click handler) — add this inside `renderDrawer()`, right after the `drawer.querySelectorAll('.cart-row-remove')` block:

```js
    var submitBtn = drawer.querySelector('#cart-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        renderContactForm(drawer);
      });
    }
```

Add these two new functions inside the IIFE, above `window.Cart = ...`:

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

  function submitOrder(payload) {
    var base = window.CART_API_BASE || '';
    fetch(base + '/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          document.getElementById('cart-submit-error').textContent = 'Error: ' + result.data.error;
          return;
        }
        var summary = payload.items.map(function (i) { return i.qty + 'x ' + i.name; }).join(', ');
        var waText = encodeURIComponent(
          'Hello Restar Solar, I would like a quote for: ' + summary + ' (order ' + result.data.id + ')'
        );
        window.open('https://wa.me/' + window.CART_WHATSAPP_NUMBER + '?text=' + waText, '_blank');
        clear();
      })
      .catch(function () {
        document.getElementById('cart-submit-error').textContent = 'Network error, please try again.';
      });
  }
```

- [ ] **Step 2: Set the two new config globals in `index.html`**

Run: `grep -n "AGENT_PHONE_2" index.html` and confirm the variable holding Luc Su's Cameroon number (per the plan's Interfaces section above).

Immediately after the `window.CART_ENABLED = CART_ENABLED;` line added in Task 4 Step 3, add:
```js
window.CART_API_BASE = '';
window.CART_WHATSAPP_NUMBER = AGENT_PHONE_2;
```

(If Step 1's grep shows the variable is declared later in the file than this insertion point, move these two new lines to immediately after that variable's declaration instead, so `AGENT_PHONE_2` is defined before it's read.)

- [ ] **Step 3: Gate the cart feature off for other countries in the generator script**

Read `scripts/generate_country_site.py`'s `set_default_language()` function (it already does string-replacement on `let lang = "en";`). Add a new function right after it:

```python
def disable_cart(html: str) -> str:
    """Cart checkout is Cameroon-only for now — other countries don't have
    the backend deployed, so ship the flag off rather than a broken button."""
    return html.replace("const CART_ENABLED = true;", "const CART_ENABLED = false;")
```

In `generate_index_html()`, add the call right after the existing `html = set_default_language(html, country)` line:
```python
    html = disable_cart(html)
```

- [ ] **Step 4: Manually verify the full flow locally**

Terminal 1: `cd backend && npx wrangler dev`
Terminal 2: `python3 -m http.server 8899` from the repo root

In `index.html`, temporarily set `window.CART_API_BASE = 'http://localhost:8787';` (only for this manual test — revert before committing, production will same-origin route `/api/*` through the deployed Worker per the deployment note below).

Open `http://localhost:8899/index.html`, add a product to the cart, click "Request quote for cart", fill in the contact form, submit.

Verify:
1. A new browser tab opens to `wa.me` with the cart summary and order id pre-filled.
2. `curl -s http://localhost:8787/api/orders` — no route for GET, but confirm the order landed: `cd backend && npx wrangler d1 execute camaroom-orders --local --command="SELECT id, customer_name, status FROM orders"` shows the new row with `status = submitted`.

Then verify the generator gating: run `python3 scripts/generate_country_site.py --country nigeria --out /tmp/nigeria-cart-check` and `grep "CART_ENABLED" /tmp/nigeria-cart-check/index.html` — expect `const CART_ENABLED = false;`.

Revert the temporary `CART_API_BASE` value back to `''` before committing.

- [ ] **Step 5: Commit**

```bash
git add assets/js/cart.js index.html scripts/generate_country_site.py
git commit -m "Wire cart submission to backend API and gate the feature off for non-Cameroon sites"
```

---

## Deployment Note (not a task — do this once, outside this plan, when going live)

This plan builds and locally verifies the feature. Production rollout needs, separately:
1. `cd backend && npx wrangler d1 execute camaroom-orders --remote --file=schema.sql` (apply schema to the real D1 database).
2. `cd backend && npx wrangler secret put ADMIN_PASSWORD` (and the same for `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SALES_NOTIFICATION_EMAIL`, `PAYMENT_REDIRECT_URL`) — the real Flutterwave/Resend credentials from the business, per the open items noted in the design spec.
3. `cd backend && npx wrangler deploy` — get the Worker's real `*.workers.dev` URL (or a custom route once the domain work happens).
4. Set `window.CART_API_BASE` in the deployed `index.html` to that URL.
5. Run at least one real end-to-end test against Flutterwave's **sandbox/test mode** (test API keys, their documented test Mobile Money numbers) — submit a cart, generate a quote, pay through the actual hosted Flutterwave checkout, and confirm the webhook fires and flips the order to `paid` with the email notification arriving. This is the one part of the "Testing Approach" in the design spec that can't be automated in this plan — it needs live sandbox credentials that don't exist until deploy time. Only switch `FLUTTERWAVE_SECRET_KEY`/`FLUTTERWAVE_WEBHOOK_SECRET` to live keys after this passes.
