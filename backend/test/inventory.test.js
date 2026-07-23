import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getStock, setStock, listInventory, reserveStockForItems } from '../src/inventory.js';

const schema = 'CREATE TABLE inventory (sku TEXT PRIMARY KEY, stock_qty INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);';

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS inventory');
  await env.DB.exec(schema);
});

describe('getStock', () => {
  it('returns null for a SKU that has never been set (untracked, not zero)', async () => {
    expect(await getStock(env.DB, 'SP-999')).toBeNull();
  });

  it('returns the stored quantity after setStock', async () => {
    await setStock(env.DB, 'SP-005', 10);
    expect(await getStock(env.DB, 'SP-005')).toBe(10);
  });
});

describe('setStock', () => {
  it('upserts — a second call updates rather than duplicating', async () => {
    await setStock(env.DB, 'SP-005', 10);
    await setStock(env.DB, 'SP-005', 3);
    expect(await getStock(env.DB, 'SP-005')).toBe(3);
    const all = await listInventory(env.DB);
    expect(all.filter((r) => r.sku === 'SP-005')).toHaveLength(1);
  });

  it('rejects a negative quantity', async () => {
    await expect(setStock(env.DB, 'SP-005', -1)).rejects.toThrow('invalid_stock_qty');
  });

  it('rejects a non-integer quantity', async () => {
    await expect(setStock(env.DB, 'SP-005', 1.5)).rejects.toThrow('invalid_stock_qty');
  });
});

describe('reserveStockForItems', () => {
  it('decrements stock for tracked SKUs', async () => {
    await setStock(env.DB, 'SP-005', 10);
    await reserveStockForItems(env.DB, [{ sku: 'SP-005', qty: 3 }]);
    expect(await getStock(env.DB, 'SP-005')).toBe(7);
  });

  it('rejects the whole reservation if any tracked item is short, without partially decrementing', async () => {
    await setStock(env.DB, 'SP-005', 10);
    await setStock(env.DB, 'SP-006', 1);

    await expect(
      reserveStockForItems(env.DB, [
        { sku: 'SP-005', qty: 3 },
        { sku: 'SP-006', qty: 5 },
      ])
    ).rejects.toThrow('insufficient_stock:SP-006');

    // SP-005 must be untouched even though it had enough stock — all-or-nothing.
    expect(await getStock(env.DB, 'SP-005')).toBe(10);
  });

  it('does not block on SKUs with no inventory row (untracked = unlimited)', async () => {
    await expect(
      reserveStockForItems(env.DB, [{ sku: 'UNTRACKED-SKU', qty: 999 }])
    ).resolves.toBeUndefined();
    // Still no row was created for it — it stays untracked.
    expect(await getStock(env.DB, 'UNTRACKED-SKU')).toBeNull();
  });

  it('mixes tracked and untracked SKUs in one order correctly', async () => {
    await setStock(env.DB, 'SP-005', 10);
    await reserveStockForItems(env.DB, [
      { sku: 'SP-005', qty: 4 },
      { sku: 'UNTRACKED-SKU', qty: 999 },
    ]);
    expect(await getStock(env.DB, 'SP-005')).toBe(6);
  });
});
