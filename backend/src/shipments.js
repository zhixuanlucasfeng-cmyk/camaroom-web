import { getOrder } from './orders.js';

// Ordered stages a shipment (a physical container of stock shipped from
// China) moves through. There is no carrier API — sales/logistics staff
// advance this by hand from the admin shipments page, and every order
// assigned to a shipment shows the same stage to the customer.
export const SHIPMENT_STAGES = [
  'preparing',
  'shipped',
  'at_sea',
  'arrived_port',
  'customs',
  'ready_for_pickup',
  'delivered',
];

function generateShipmentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `ship_${hex}`;
}

export async function createShipment(db, label) {
  if (!label || typeof label !== 'string') {
    throw new Error('invalid_label');
  }
  const id = generateShipmentId();
  const now = new Date().toISOString();
  await db
    .prepare(`INSERT INTO shipments (id, label, status, created_at, updated_at) VALUES (?, ?, 'preparing', ?, ?)`)
    .bind(id, label, now, now)
    .run();
  return { id, label, status: 'preparing', created_at: now, updated_at: now };
}

export async function getShipment(db, id) {
  const row = await db.prepare('SELECT * FROM shipments WHERE id = ?').bind(id).first();
  return row || null;
}

export async function listShipments(db) {
  const { results } = await db.prepare('SELECT * FROM shipments ORDER BY created_at DESC').all();
  return results;
}

export async function updateShipmentStatus(db, id, status) {
  if (!SHIPMENT_STAGES.includes(status)) {
    throw new Error('invalid_status');
  }
  const shipment = await getShipment(db, id);
  if (!shipment) {
    throw new Error('shipment_not_found');
  }
  const updated_at = new Date().toISOString();
  await db.prepare('UPDATE shipments SET status = ?, updated_at = ? WHERE id = ?').bind(status, updated_at, id).run();
  return { ...shipment, status, updated_at };
}

export async function assignOrderToShipment(db, orderId, shipmentId) {
  const order = await getOrder(db, orderId);
  if (!order) {
    throw new Error('order_not_found');
  }
  const shipment = await getShipment(db, shipmentId);
  if (!shipment) {
    throw new Error('shipment_not_found');
  }
  await db.prepare('UPDATE orders SET shipment_id = ? WHERE id = ?').bind(shipmentId, orderId).run();
  return { order_id: orderId, shipment_id: shipmentId };
}

export async function handleCreateShipment(request, env) {
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
    const result = await createShipment(env.DB, body.label);
    return new Response(JSON.stringify(result), {
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

export async function handleListShipments(request, env) {
  const results = await listShipments(env.DB);
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleUpdateShipmentStatus(request, env, id) {
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
    const result = await updateShipmentStatus(env.DB, id, body.status);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err.message === 'shipment_not_found' ? 404 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function handleAssignOrderShipment(request, env, orderId) {
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
    const result = await assignOrderToShipment(env.DB, orderId, body.shipment_id);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err.message.endsWith('_not_found') ? 404 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
