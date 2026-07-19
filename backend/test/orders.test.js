import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder, getOrder } from '../src/orders.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, payment_link TEXT, flutterwave_tx_ref TEXT, paid_at TEXT);';

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
