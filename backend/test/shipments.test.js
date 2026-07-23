import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrder } from '../src/orders.js';
import {
  createShipment,
  getShipment,
  listShipments,
  updateShipmentStatus,
  assignOrderToShipment,
  SHIPMENT_STAGES,
} from '../src/shipments.js';

const schema = `
CREATE TABLE shipments (id TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'preparing', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT, shipment_id TEXT);
`;

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec('DROP TABLE IF EXISTS shipments');
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.exec(stmt);
  }
});

async function makeOrder() {
  return createOrder(env.DB, {
    customer_name: 'Jean',
    customer_phone: '+237600000001',
    items: [{ sku: 'SP-005', name: 'Panel', qty: 1 }],
    currency: 'XAF',
  });
}

describe('createShipment', () => {
  it('creates a shipment starting at the first stage', async () => {
    const shipment = await createShipment(env.DB, '2026-07 Container');
    expect(shipment.status).toBe('preparing');
    expect(shipment.label).toBe('2026-07 Container');
    expect(shipment.id).toMatch(/^ship_[0-9a-f]{8}$/);
  });

  it('rejects an empty label', async () => {
    await expect(createShipment(env.DB, '')).rejects.toThrow('invalid_label');
  });
});

describe('updateShipmentStatus', () => {
  it('advances through a valid stage', async () => {
    const shipment = await createShipment(env.DB, 'Container A');
    const updated = await updateShipmentStatus(env.DB, shipment.id, 'shipped');
    expect(updated.status).toBe('shipped');

    const reloaded = await getShipment(env.DB, shipment.id);
    expect(reloaded.status).toBe('shipped');
  });

  it('rejects a status outside SHIPMENT_STAGES', async () => {
    const shipment = await createShipment(env.DB, 'Container A');
    await expect(updateShipmentStatus(env.DB, shipment.id, 'teleported')).rejects.toThrow('invalid_status');
  });

  it('rejects an unknown shipment id', async () => {
    await expect(updateShipmentStatus(env.DB, 'ship_doesnotexist', 'shipped')).rejects.toThrow('shipment_not_found');
  });

  it('allows moving to any stage, not just the next one (manual correction)', async () => {
    const shipment = await createShipment(env.DB, 'Container A');
    const updated = await updateShipmentStatus(env.DB, shipment.id, 'delivered');
    expect(updated.status).toBe('delivered');
  });
});

describe('assignOrderToShipment', () => {
  it('links an order to a shipment', async () => {
    const { id: orderId } = await makeOrder();
    const shipment = await createShipment(env.DB, 'Container A');

    await assignOrderToShipment(env.DB, orderId, shipment.id);

    const row = await env.DB.prepare('SELECT shipment_id FROM orders WHERE id = ?').bind(orderId).first();
    expect(row.shipment_id).toBe(shipment.id);
  });

  it('rejects an unknown order id', async () => {
    const shipment = await createShipment(env.DB, 'Container A');
    await expect(assignOrderToShipment(env.DB, 'ord_doesnotexist', shipment.id)).rejects.toThrow('order_not_found');
  });

  it('rejects an unknown shipment id', async () => {
    const { id: orderId } = await makeOrder();
    await expect(assignOrderToShipment(env.DB, orderId, 'ship_doesnotexist')).rejects.toThrow('shipment_not_found');
  });
});

describe('listShipments', () => {
  it('lists all shipments', async () => {
    await createShipment(env.DB, 'Container A');
    await createShipment(env.DB, 'Container B');
    const all = await listShipments(env.DB);
    expect(all).toHaveLength(2);
  });
});

describe('SHIPMENT_STAGES', () => {
  it('starts with preparing and ends with delivered', () => {
    expect(SHIPMENT_STAGES[0]).toBe('preparing');
    expect(SHIPMENT_STAGES[SHIPMENT_STAGES.length - 1]).toBe('delivered');
  });
});
