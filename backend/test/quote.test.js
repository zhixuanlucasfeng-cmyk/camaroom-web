import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder } from '../src/orders.js';
import { submitQuote } from '../src/quote.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, payment_link TEXT, flutterwave_tx_ref TEXT, paid_at TEXT);';

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
