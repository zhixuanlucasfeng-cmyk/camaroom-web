import { listShipments, SHIPMENT_STAGES } from './shipments.js';
import { listInventory } from './inventory.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

const ADMIN_NAV = `<p><a href="/admin/shipments">Shipments</a> · <a href="/admin/inventory">Inventory</a></p>`;

export async function handleGetShipmentsPage(request, env) {
  const shipments = await listShipments(env.DB);
  const stageOptions = SHIPMENT_STAGES.map((s) => `<option value="${s}">${s}</option>`).join('');

  const rows = shipments
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.id)}</td>
      <td>${escapeHtml(s.label)}</td>
      <td id="status-${escapeHtml(s.id)}">${escapeHtml(s.status)}</td>
      <td>
        <select id="stage-${escapeHtml(s.id)}">${stageOptions}</select>
        <button type="button" onclick="updateStatus('${escapeHtml(s.id)}')">Update</button>
      </td>
    </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Shipments</title></head>
<body>
${ADMIN_NAV}
<h1>Shipments</h1>

<form id="createForm">
  <input type="text" id="label" placeholder="e.g. 2026-07 Container" required>
  <button type="submit">Create shipment</button>
</form>
<p id="createResult"></p>

<table border="1" cellpadding="6">
  <thead><tr><th>ID</th><th>Label</th><th>Status</th><th>Update status</th></tr></thead>
  <tbody id="shipmentsBody">${rows}</tbody>
</table>

<script>
  document.getElementById('createForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var label = document.getElementById('label').value;
    fetch('/api/shipments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: label }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.id) {
          window.location.reload();
        } else {
          document.getElementById('createResult').textContent = 'Error: ' + data.error;
        }
      });
  });

  function updateStatus(id) {
    var status = document.getElementById('stage-' + id).value;
    fetch('/api/shipments/' + id + '/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: status }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status) {
          document.getElementById('status-' + id).textContent = data.status;
        } else {
          alert('Error: ' + data.error);
        }
      });
  }
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function handleGetInventoryPage(request, env) {
  const items = await listInventory(env.DB);
  const rows = items
    .map((i) => `<tr><td>${escapeHtml(i.sku)}</td><td>${escapeHtml(i.stock_qty)}</td></tr>`)
    .join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Inventory</title></head>
<body>
${ADMIN_NAV}
<h1>Inventory</h1>

<form id="setForm">
  <input type="text" id="sku" placeholder="SKU, e.g. SP-045" required>
  <input type="number" id="qty" placeholder="Stock quantity" min="0" required>
  <button type="submit">Set stock</button>
</form>
<p id="setResult"></p>

<table border="1" cellpadding="6">
  <thead><tr><th>SKU</th><th>Stock</th></tr></thead>
  <tbody id="inventoryBody">${rows}</tbody>
</table>

<script>
  document.getElementById('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var sku = document.getElementById('sku').value;
    var qty = parseInt(document.getElementById('qty').value, 10);
    fetch('/api/inventory/' + encodeURIComponent(sku), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stock_qty: qty }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.sku) {
          window.location.reload();
        } else {
          document.getElementById('setResult').textContent = 'Error: ' + data.error;
        }
      });
  });
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
