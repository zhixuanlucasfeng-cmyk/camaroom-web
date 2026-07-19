import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder } from '../src/orders.js';
import { submitQuote } from '../src/quote.js';
import { handleFlutterwaveWebhook } from '../src/webhook.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, payment_link TEXT, flutterwave_tx_ref TEXT, paid_at TEXT);';

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
