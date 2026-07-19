import { getOrder } from './orders.js';
import { createPaymentLink } from './flutterwave.js';

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
    return { id: order.id, payment_link: order.payment_link, status: order.status };
  }

  const tx_ref = `${order.id}_${Date.now()}`;
  const payment_link = await createPaymentLink(
    {
      amount: price,
      currency: order.currency,
      txRef: tx_ref,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
    },
    env
  );

  await db
    .prepare(
      `UPDATE orders SET quoted_price = ?, payment_link = ?, flutterwave_tx_ref = ?, status = 'quoted' WHERE id = ?`
    )
    .bind(price, payment_link, tx_ref, order.id)
    .run();

  return { id: order.id, payment_link, status: 'quoted' };
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

  let actionHtml;
  if (order.status === 'submitted') {
    actionHtml = `
      <form id="quoteForm">
        <input type="number" id="price" placeholder="Price in ${escapeHtml(order.currency)}" required>
        <button type="submit">Generate payment link</button>
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
              if (data.payment_link) {
                var waText = encodeURIComponent('Here is your payment link: ' + data.payment_link);
                var waUrl = 'https://wa.me/${digitsOnlyPhone}?text=' + waText;
                resultEl.innerHTML =
                  '<a href="' + data.payment_link + '" target="_blank">Payment link</a><br>' +
                  '<a href="' + waUrl + '" target="_blank">Send via WhatsApp</a>';
              } else {
                resultEl.textContent = 'Error: ' + data.error;
              }
            });
        });
      </script>`;
  } else {
    const link = escapeHtml(order.payment_link || '');
    actionHtml = `<p>Payment link: <a href="${link}">${link}</a></p>`;
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Quote order ${escapeHtml(order.id)}</title></head>
<body>
<h1>Order ${escapeHtml(order.id)}</h1>
<p>Customer: ${escapeHtml(order.customer_name)} (${escapeHtml(order.customer_phone)})</p>
<p>Currency: ${escapeHtml(order.currency)}</p>
<ul>${itemsHtml}</ul>
<p>Status: ${escapeHtml(order.status)}</p>
${actionHtml}
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html' } });
}
