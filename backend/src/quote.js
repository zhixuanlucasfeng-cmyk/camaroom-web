import { getOrder } from './orders.js';
import { sendPaidNotification } from './email.js';
import { reserveStockForItems } from './inventory.js';
import { listShipments, getShipment } from './shipments.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export async function submitQuote(db, env, id, price) {
  if (!Number.isInteger(price) || price <= 0) {
    throw new Error('invalid_price');
  }
  const order = await getOrder(db, id);
  if (!order) {
    throw new Error('order_not_found');
  }
  if (order.status !== 'submitted') {
    return { id: order.id, status: order.status, quoted_price: order.quoted_price };
  }

  // Reserve stock at quote time — this is the point sales commits to
  // selling specific units, since there's no real-time checkout. Throws
  // insufficient_stock:<sku> if any tracked line item doesn't have enough,
  // which handleSubmitQuote surfaces to the admin quote page.
  await reserveStockForItems(db, JSON.parse(order.items));

  await db
    .prepare(`UPDATE orders SET quoted_price = ?, status = 'quoted' WHERE id = ?`)
    .bind(price, order.id)
    .run();

  return { id: order.id, status: 'quoted', quoted_price: price };
}

export async function handleSubmitQuote(request, env, id) {
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
    const result = await submitQuote(env.DB, env, id, body.price);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err.message === 'order_not_found' ? 404 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function handleGetQuotePage(request, env, id) {
  const order = await getOrder(env.DB, id);
  if (!order) {
    return new Response('Order not found', { status: 404 });
  }
  const items = JSON.parse(order.items);
  const itemsHtml = items
    .map((i) => `<li>${escapeHtml(i.qty)} x ${escapeHtml(i.name)}</li>`)
    .join('');
  const digitsOnlyPhone = order.customer_phone.replace(/[^0-9]/g, '');
  const momoNumber = escapeHtml(env.MOMO_TRANSFER_NUMBER || '');
  const momoName = escapeHtml(env.MOMO_ACCOUNT_NAME || '');
  const momoNetworkLabel = escapeHtml(env.MOMO_NETWORK_LABEL || '');

  const allShipments = await listShipments(env.DB);
  const currentShipment = order.shipment_id ? await getShipment(env.DB, order.shipment_id) : null;
  const shipmentOptions = allShipments
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}"${s.id === order.shipment_id ? ' selected' : ''}>${escapeHtml(s.label)} (${escapeHtml(s.status)})</option>`
    )
    .join('');
  const shipmentHtml = `
    <p>Shipment: ${currentShipment ? escapeHtml(currentShipment.label) + ' — ' + escapeHtml(currentShipment.status) : 'not assigned'}</p>
    <select id="shipmentSelect">
      <option value="">— none —</option>
      ${shipmentOptions}
    </select>
    <button type="button" id="assignShipmentBtn">Assign</button>
    <p id="shipmentResult"></p>
    <script>
      document.getElementById('assignShipmentBtn').addEventListener('click', function () {
        var shipmentId = document.getElementById('shipmentSelect').value;
        if (!shipmentId) { return; }
        fetch('/api/orders/${order.id}/assign-shipment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shipment_id: shipmentId }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.shipment_id) {
              window.location.reload();
            } else {
              document.getElementById('shipmentResult').textContent = 'Error: ' + data.error;
            }
          });
      });
    </script>`;

  let actionHtml;
  if (order.status === 'submitted') {
    actionHtml = `
      <form id="quoteForm">
        <input type="number" id="price" placeholder="Price in ${escapeHtml(order.currency)}" required>
        <button type="submit">Save price and get transfer instructions</button>
      </form>
      <p id="result"></p>
      <script>
        document.getElementById('quoteForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var price = parseInt(document.getElementById('price').value, 10);
          fetch('/api/orders/${order.id}/quote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ price: price }),
          })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              var resultEl = document.getElementById('result');
              if (data.quoted_price) {
                var instructions = 'Please send ' + data.quoted_price + ' ${escapeHtml(order.currency)} via ${momoNetworkLabel} to ${momoNumber} (${momoName}). Include order ' + data.id + ' as the transfer note/reference.';
                var waText = encodeURIComponent(instructions);
                var waUrl = 'https://wa.me/${digitsOnlyPhone}?text=' + waText;
                resultEl.innerHTML =
                  '<p>' + instructions + '</p>' +
                  '<a href="' + waUrl + '" target="_blank">Send via WhatsApp</a><br>' +
                  '<button id="markPaidBtn" type="button">Mark as paid</button>';
                document.getElementById('markPaidBtn').addEventListener('click', function () {
                  fetch('/api/orders/${order.id}/mark-paid', { method: 'POST' })
                    .then(function () { window.location.reload(); });
                });
              } else {
                resultEl.textContent = 'Error: ' + data.error;
              }
            });
        });
      </script>`;
  } else if (order.status === 'quoted') {
    const instructions = `Please send ${order.quoted_price} ${escapeHtml(order.currency)} via ${momoNetworkLabel} to ${momoNumber} (${momoName}). Include order ${escapeHtml(order.id)} as the transfer note/reference.`;
    const waText = encodeURIComponent(instructions);
    const waUrl = `https://wa.me/${digitsOnlyPhone}?text=${waText}`;
    actionHtml = `
      <p>${instructions}</p>
      <a href="${waUrl}" target="_blank">Send via WhatsApp</a><br>
      <button id="markPaidBtn" type="button">Mark as paid</button>
      <p id="result"></p>
      <script>
        document.getElementById('markPaidBtn').addEventListener('click', function () {
          fetch('/api/orders/${order.id}/mark-paid', { method: 'POST' })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (data.status === 'paid') {
                window.location.reload();
              } else {
                document.getElementById('result').textContent = 'Error: ' + data.error;
              }
            });
        });
      </script>`;
  } else {
    actionHtml = `<p>Paid at: ${escapeHtml(order.paid_at || '')}</p>`;
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Quote order ${escapeHtml(order.id)}</title></head>
<body>
<p><a href="/admin/shipments">Shipments</a> · <a href="/admin/inventory">Inventory</a></p>
<h1>Order ${escapeHtml(order.id)}</h1>
<p>Customer: ${escapeHtml(order.customer_name)} (${escapeHtml(order.customer_phone)})</p>
<p>Currency: ${escapeHtml(order.currency)}</p>
<ul>${itemsHtml}</ul>
<p>Status: ${escapeHtml(order.status)}</p>
${actionHtml}
${shipmentHtml}
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html' } });
}

export async function markOrderPaid(db, env, id) {
  const order = await getOrder(db, id);
  if (!order) {
    throw new Error('order_not_found');
  }
  if (order.status === 'paid') {
    return { id: order.id, status: 'paid', paid_at: order.paid_at };
  }
  if (order.status !== 'quoted') {
    throw new Error('order_not_quoted');
  }

  const paid_at = new Date().toISOString();
  await db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").bind(paid_at, id).run();

  try {
    await sendPaidNotification({ ...order, status: 'paid', paid_at }, env);
  } catch (err) {
    console.error('sendPaidNotification failed for order', order.id, err);
  }

  return { id: order.id, status: 'paid', paid_at };
}

export async function handleMarkOrderPaid(request, env, id) {
  try {
    const result = await markOrderPaid(env.DB, env, id);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err.message === 'order_not_found' ? 404 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
