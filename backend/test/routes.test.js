import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index.js';
import { makeSessionCookie } from '../src/auth.js';
import { createOrder } from '../src/orders.js';

const schema = `
CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT, shipment_id TEXT);
CREATE TABLE shipments (id TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'preparing', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE inventory (sku TEXT PRIMARY KEY, stock_qty INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE sales_reps (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE rep_assignments (session_id TEXT PRIMARY KEY, rep_id TEXT NOT NULL, source TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec('DROP TABLE IF EXISTS shipments');
  await env.DB.exec('DROP TABLE IF EXISTS inventory');
  await env.DB.exec('DROP TABLE IF EXISTS rep_assignments');
  await env.DB.exec('DROP TABLE IF EXISTS sales_reps');
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.exec(stmt);
  }
  await env.DB.prepare('INSERT INTO sales_reps (id, name, phone, active) VALUES (?, ?, ?, 1)').bind('rep-1', 'Yamadou', '22370750537').run();
  env.ADMIN_PASSWORD = 'test-shared-password';
  env.ORDER_CURRENCY = 'XAF';
});

async function authCookie() {
  return (await makeSessionCookie(env)).split(';')[0];
}

describe('GET /api/inventory', () => {
  it('is public — no auth required', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/inventory'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('carries CORS headers for the storefront to read cross-origin', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/inventory'), env);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/inventory', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});

describe('POST /api/inventory/:sku', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/inventory/SP-005', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stock_qty: 5 }),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('sets stock when authenticated, and it shows up in the public GET', async () => {
    const cookie = await authCookie();
    const res = await worker.fetch(
      new Request('https://example.com/api/inventory/SP-005', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ stock_qty: 5 }),
      }),
      env
    );
    expect(res.status).toBe(200);

    const listRes = await worker.fetch(new Request('https://example.com/api/inventory'), env);
    expect(await listRes.json()).toEqual([{ sku: 'SP-005', stock_qty: 5 }]);
  });
});

describe('POST /api/shipments', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('creates a shipment when authenticated', async () => {
    const cookie = await authCookie();
    const res = await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.label).toBe('Container A');
    expect(body.status).toBe('preparing');
  });
});

describe('GET /api/shipments', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/shipments'), env);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/shipments/:id/status', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/shipments/ship_x/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'shipped' }),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('updates status when authenticated', async () => {
    const cookie = await authCookie();
    const createRes = await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );
    const { id } = await createRes.json();

    const statusRes = await worker.fetch(
      new Request(`https://example.com/api/shipments/${id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ status: 'shipped' }),
      }),
      env
    );
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).status).toBe('shipped');
  });
});

describe('POST /api/orders/:id/assign-shipment', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/orders/ord_x/assign-shipment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shipment_id: 'ship_x' }),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('assigns an order to a shipment when authenticated', async () => {
    const cookie = await authCookie();
    const { id: orderId } = await createOrder(
      env.DB,
      {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'SP-005', name: 'Panel', qty: 1 }],
        currency: 'XAF',
      },
      'XAF'
    );
    const createRes = await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );
    const { id: shipmentId } = await createRes.json();

    const assignRes = await worker.fetch(
      new Request(`https://example.com/api/orders/${orderId}/assign-shipment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ shipment_id: shipmentId }),
      }),
      env
    );
    expect(assignRes.status).toBe(200);

    const statusPageRes = await worker.fetch(new Request(`https://example.com/order/${orderId}`), env);
    const html = await statusPageRes.text();
    expect(html).toContain('Shipment tracking');
  });
});

describe('GET /admin/shipments', () => {
  it('shows the login page, unauthenticated', async () => {
    const res = await worker.fetch(new Request('https://example.com/admin/shipments'), env);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('loginForm');
  });

  it('lists shipments and a create form, authenticated', async () => {
    const cookie = await authCookie();
    await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );

    const res = await worker.fetch(new Request('https://example.com/admin/shipments', { headers: { cookie } }), env);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Container A');
    expect(html).toContain('createForm');
  });
});

describe('GET /admin/inventory', () => {
  it('shows the login page, unauthenticated', async () => {
    const res = await worker.fetch(new Request('https://example.com/admin/inventory'), env);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('loginForm');
  });

  it('lists stock levels and a set-stock form, authenticated', async () => {
    const cookie = await authCookie();
    await worker.fetch(
      new Request('https://example.com/api/inventory/SP-005', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ stock_qty: 12 }),
      }),
      env
    );

    const res = await worker.fetch(new Request('https://example.com/admin/inventory', { headers: { cookie } }), env);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('SP-005');
    expect(html).toContain('12');
    expect(html).toContain('setForm');
  });
});

describe('GET /admin/quote/:id — shipment assignment section', () => {
  it('shows "not assigned" and a select of available shipments', async () => {
    const cookie = await authCookie();
    const { id: orderId } = await createOrder(
      env.DB,
      {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'SP-005', name: 'Panel', qty: 1 }],
        currency: 'XAF',
      },
      'XAF'
    );
    await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );

    const res = await worker.fetch(new Request(`https://example.com/admin/quote/${orderId}`, { headers: { cookie } }), env);
    const html = await res.text();

    expect(html).toContain('not assigned');
    expect(html).toContain('Container A');
    expect(html).toContain('assignShipmentBtn');
  });

  it('shows the shipment label and status once assigned', async () => {
    const cookie = await authCookie();
    const { id: orderId } = await createOrder(
      env.DB,
      {
        customer_name: 'Jean',
        customer_phone: '+237600000001',
        items: [{ sku: 'SP-005', name: 'Panel', qty: 1 }],
        currency: 'XAF',
      },
      'XAF'
    );
    const createRes = await worker.fetch(
      new Request('https://example.com/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Container A' }),
      }),
      env
    );
    const { id: shipmentId } = await createRes.json();
    await worker.fetch(
      new Request(`https://example.com/api/orders/${orderId}/assign-shipment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ shipment_id: shipmentId }),
      }),
      env
    );

    const res = await worker.fetch(new Request(`https://example.com/admin/quote/${orderId}`, { headers: { cookie } }), env);
    const html = await res.text();

    expect(html).toContain('Container A — preparing');
  });
});

describe('GET /api/sales-rep', () => {
  it('returns the assigned rep for a session, CORS-enabled', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/sales-rep?session=sess-1&source=nav_whatsapp'),
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const data = await res.json();
    expect(data.rep_id).toBe('rep-1');
    expect(data.name).toBe('Yamadou');
    expect(data.phone).toBe('22370750537');
  });

  it('rejects a request with no session param', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sales-rep?source=nav_whatsapp'), env);
    expect(res.status).toBe(400);
  });

  it('handles the CORS preflight', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/sales-rep', { method: 'OPTIONS' }),
      env
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('POST /api/orders with session_id', () => {
  it('links the order to the session\'s existing rep assignment', async () => {
    await worker.fetch(new Request('https://example.com/api/sales-rep?session=sess-2&source=hero_whatsapp'), env);

    const res = await worker.fetch(
      new Request('https://example.com/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'Jean',
          customer_phone: '+237600000001',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'XAF',
          session_id: 'sess-2',
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const { id: orderId } = await res.json();

    const row = await env.DB.prepare('SELECT * FROM rep_assignments WHERE session_id = ?').bind('sess-2').first();
    expect(row.order_id).toBe(orderId);
    expect(row.source).toBe('hero_whatsapp');
  });

  it('creates a fresh assignment when the order is the session\'s first touch', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'Jean',
          customer_phone: '+237600000001',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'XAF',
          session_id: 'sess-3',
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const { id: orderId } = await res.json();

    const row = await env.DB.prepare('SELECT * FROM rep_assignments WHERE session_id = ?').bind('sess-3').first();
    expect(row.order_id).toBe(orderId);
    expect(row.source).toBe('order');
  });

  it('still creates the order successfully when no session_id is sent (backward compatible)', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'Jean',
          customer_phone: '+237600000001',
          items: [{ sku: 'panel-450w', name: '450W Panel', qty: 1 }],
          currency: 'XAF',
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
  });
});
