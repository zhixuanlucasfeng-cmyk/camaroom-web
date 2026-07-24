import { generateOrderId } from './id.js';

export async function createOrder(db, { customer_name, customer_phone, items, currency }, expectedCurrency) {
  if (!customer_name || !customer_phone || !Array.isArray(items) || items.length === 0) {
    throw new Error('invalid_order');
  }
  if (currency !== expectedCurrency) {
    throw new Error('invalid_currency');
  }
  const id = generateOrderId();
  const created_at = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO orders (id, created_at, customer_name, customer_phone, items, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted')`
    )
    .bind(id, created_at, customer_name, customer_phone, JSON.stringify(items), currency)
    .run();
  return { id, created_at };
}

export async function getOrder(db, id) {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return row || null;
}

export async function handleCreateOrder(request, env) {
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
    const order = await createOrder(env.DB, body, env.ORDER_CURRENCY);
    return new Response(JSON.stringify(order), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
}
