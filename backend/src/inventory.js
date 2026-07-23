// Returns null (not 0) when the SKU has no inventory row at all — that
// means stock isn't tracked for it yet (rollout is per-SKU, most of the
// catalog has none), and reserveStockForItems below treats null as
// "unlimited, don't block" rather than "zero, reject every order."
export async function getStock(db, sku) {
  const row = await db.prepare('SELECT sku, stock_qty FROM inventory WHERE sku = ?').bind(sku).first();
  return row ? row.stock_qty : null;
}

export async function listInventory(db) {
  const { results } = await db.prepare('SELECT sku, stock_qty FROM inventory ORDER BY sku').all();
  return results;
}

export async function setStock(db, sku, stock_qty) {
  if (!sku || typeof sku !== 'string') {
    throw new Error('invalid_sku');
  }
  if (!Number.isInteger(stock_qty) || stock_qty < 0) {
    throw new Error('invalid_stock_qty');
  }
  const updated_at = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO inventory (sku, stock_qty, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(sku) DO UPDATE SET stock_qty = excluded.stock_qty, updated_at = excluded.updated_at`
    )
    .bind(sku, stock_qty, updated_at)
    .run();
  return { sku, stock_qty, updated_at };
}

// Reserves stock for a quoted order — called from submitQuote (quote.js) at
// the point a sales rep commits to selling specific units, not at checkout
// time (there's no real-time checkout; a human quotes each cart). Rejects
// the whole quote if any single line item doesn't have enough stock, rather
// than partially reserving — a half-reserved order is worse than a rejected
// one, since it's manually corrected either way.
export async function reserveStockForItems(db, items) {
  const currentStock = new Map();
  for (const item of items) {
    const current = await getStock(db, item.sku);
    if (current === null) continue; // not tracked — don't block
    if (current < item.qty) {
      throw new Error(`insufficient_stock:${item.sku}`);
    }
    currentStock.set(item.sku, current);
  }
  for (const [sku, current] of currentStock) {
    const item = items.find((i) => i.sku === sku);
    await setStock(db, sku, current - item.qty);
  }
}

export async function handleGetInventory(request, env) {
  const results = await listInventory(env.DB);
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleSetInventory(request, env, sku) {
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
    const result = await setStock(env.DB, sku, body.stock_qty);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
}
