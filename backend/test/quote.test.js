import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder, getOrder } from '../src/orders.js';
import { submitQuote, markOrderPaid } from '../src/quote.js';
import { setStock, getStock } from '../src/inventory.js';

// keep in sync with backend/schema.sql
const schema = 'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT, shipment_id TEXT);';
const inventorySchema = 'CREATE TABLE inventory (sku TEXT PRIMARY KEY, stock_qty INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);';

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(schema);
  await env.DB.exec('DROP TABLE IF EXISTS inventory');
  await env.DB.exec(inventorySchema);
  env.RESEND_API_KEY = 'test_resend_key';
  env.NOTIFICATION_FROM_EMAIL = 'orders@restarsolar.com';
  env.SALES_NOTIFICATION_EMAIL = 'sales@restarsolar.com';
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

  it('reserves (decrements) tracked stock when quoting', async () => {
    await setStock(env.DB, 'panel-450w', 5);
    const { id } = await makeOrder(); // orders 2x panel-450w

    await submitQuote(env.DB, env, id, 150000);

    expect(await getStock(env.DB, 'panel-450w')).toBe(3);
  });

  it('rejects the quote if a tracked SKU does not have enough stock', async () => {
    await setStock(env.DB, 'panel-450w', 1); // order wants 2
    const { id } = await makeOrder();

    await expect(submitQuote(env.DB, env, id, 150000)).rejects.toThrow('insufficient_stock:panel-450w');

    const stored = await getOrder(env.DB, id);
    expect(stored.status).toBe('submitted'); // never advanced to quoted
    expect(await getStock(env.DB, 'panel-450w')).toBe(1); // untouched
  });

  it('does not block quoting when the SKU has no inventory row at all', async () => {
    const { id } = await makeOrder(); // panel-450w never tracked
    const result = await submitQuote(env.DB, env, id, 150000);
    expect(result.status).toBe('quoted');
  });
});

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
