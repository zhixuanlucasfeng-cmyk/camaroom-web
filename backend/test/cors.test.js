import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT, shipment_id TEXT);';

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
  env.ADMIN_PASSWORD = 'test-shared-password';
});

function validOrderBody() {
  return {
    customer_name: 'Jean',
    customer_phone: '+237600000001',
    items: [{ sku: 'panel-450w', name: '450W Panel', qty: 2 }],
    currency: 'XAF',
  };
}

describe('CORS on POST /api/orders', () => {
  it('OPTIONS /api/orders returns a 204 preflight response with CORS headers', async () => {
    const request = new Request('https://example.com/api/orders', { method: 'OPTIONS' });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type');
  });

  it('a successful POST /api/orders (201) carries both the CORS header and the original content-type', async () => {
    const request = new Request('https://example.com/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validOrderBody()),
    });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toBe('application/json');

    const body = await res.json();
    expect(body.id).toMatch(/^REST-[0-9A-Z]{6}$/);
  });

  it('a validation-failure POST /api/orders (400) still carries both the CORS header and the original content-type', async () => {
    const request = new Request('https://example.com/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validOrderBody(), items: [] }),
    });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toBe('application/json');

    const body = await res.json();
    expect(body.error).toBe('invalid_order');
  });

  it('does not add CORS headers to /admin/login (a different, authenticated route)', async () => {
    const request = new Request('https://example.com/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not add CORS headers to /api/orders/:id/quote (a different, authenticated route)', async () => {
    const request = new Request('https://example.com/api/orders/ord_doesnotexist/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ price: 1000 }),
    });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not add CORS headers to /api/orders/:id/mark-paid (a different, authenticated route)', async () => {
    const request = new Request('https://example.com/api/orders/ord_doesnotexist/mark-paid', {
      method: 'POST',
    });
    const res = await worker.fetch(request, env);

    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
