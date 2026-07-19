import { timingSafeEqual } from './util.js';
import { sendPaidNotification } from './email.js';

export async function handleFlutterwaveWebhook(request, env) {
  const signature = request.headers.get('verif-hash') || '';
  if (!env.FLUTTERWAVE_WEBHOOK_SECRET || !timingSafeEqual(signature, env.FLUTTERWAVE_WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  const txRef = payload?.data?.tx_ref;
  const status = payload?.data?.status;
  if (!txRef || status !== 'successful') {
    return new Response('Ignored', { status: 200 });
  }

  const order = await env.DB.prepare('SELECT * FROM orders WHERE flutterwave_tx_ref = ?').bind(txRef).first();
  if (!order) {
    return new Response('Order not found', { status: 404 });
  }
  if (order.status === 'paid') {
    return new Response('Already processed', { status: 200 });
  }

  const paid_at = new Date().toISOString();
  await env.DB
    .prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?")
    .bind(paid_at, order.id)
    .run();

  try {
    await sendPaidNotification({ ...order, status: 'paid', paid_at }, env);
  } catch (err) {
    console.error('sendPaidNotification failed for order', order.id, err);
  }

  return new Response('OK', { status: 200 });
}
