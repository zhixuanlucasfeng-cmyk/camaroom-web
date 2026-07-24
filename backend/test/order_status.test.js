import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index.js';
import { createOrder } from '../src/orders.js';
import { createShipment, assignOrderToShipment, updateShipmentStatus } from '../src/shipments.js';

const schema = `
CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT, shipment_id TEXT);
CREATE TABLE shipments (id TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'preparing', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec('DROP TABLE IF EXISTS shipments');
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.exec(stmt);
  }
  env.ORDER_CURRENCY = 'XAF';
});

async function makeOrder() {
  return createOrder(
    env.DB,
    {
      customer_name: 'Jean',
      customer_phone: '+237600000001',
      items: [{ sku: 'SP-005', name: '450W Panel', qty: 2 }],
      currency: 'XAF',
    },
    'XAF'
  );
}

describe('GET /order/:id', () => {
  it('returns 404 with no auth required for an unknown order', async () => {
    const res = await worker.fetch(new Request('https://example.com/order/ord_doesnotexist'), env);
    expect(res.status).toBe(404);
  });

  it('shows the order items and status, English by default', async () => {
    const { id } = await makeOrder();
    const res = await worker.fetch(new Request(`https://example.com/order/${id}`), env);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('450W Panel');
    expect(html).toContain('Order received');
  });

  it('switches to French with ?lang=fr', async () => {
    const { id } = await makeOrder();
    const res = await worker.fetch(new Request(`https://example.com/order/${id}?lang=fr`), env);
    const html = await res.text();

    expect(html).toContain('Commande reçue');
  });

  it('shows shipment tracking stages when the order is assigned to a shipment', async () => {
    const { id } = await makeOrder();
    const shipment = await createShipment(env.DB, 'Container A');
    await assignOrderToShipment(env.DB, id, shipment.id);
    await updateShipmentStatus(env.DB, shipment.id, 'at_sea');

    const res = await worker.fetch(new Request(`https://example.com/order/${id}`), env);
    const html = await res.text();

    expect(html).toContain('Shipment tracking');
    expect(html).toContain('In transit (sea freight)');
  });

  it('shows no shipment section when the order has not been assigned to one', async () => {
    const { id } = await makeOrder();
    const res = await worker.fetch(new Request(`https://example.com/order/${id}`), env);
    const html = await res.text();

    expect(html).not.toContain('Shipment tracking');
  });
});
