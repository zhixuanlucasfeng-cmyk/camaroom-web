import { getOrder } from './orders.js';
import { getShipment, SHIPMENT_STAGES } from './shipments.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

const ORDER_STATUS_LABEL = {
  submitted: { en: 'Order received', fr: 'Commande reçue' },
  quoted: { en: 'Quoted — awaiting payment', fr: 'Devis envoyé — en attente de paiement' },
  paid: { en: 'Paid', fr: 'Payée' },
};

const SHIPMENT_STAGE_LABEL = {
  preparing: { en: 'Preparing shipment', fr: "Préparation de l'expédition" },
  shipped: { en: 'Shipped from China', fr: 'Expédié depuis la Chine' },
  at_sea: { en: 'In transit (sea freight)', fr: 'En transit (fret maritime)' },
  arrived_port: { en: 'Arrived at port', fr: 'Arrivé au port' },
  customs: { en: 'Clearing customs', fr: 'Dédouanement en cours' },
  ready_for_pickup: { en: 'Ready for pickup', fr: 'Prêt pour le retrait' },
  delivered: { en: 'Delivered', fr: 'Livré' },
};

export async function handleGetOrderStatusPage(request, env, id) {
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'en';
  const t = (dict) => dict[lang];

  const order = await getOrder(env.DB, id);
  if (!order) {
    const msg = lang === 'fr' ? 'Commande introuvable' : 'Order not found';
    return new Response(msg, { status: 404 });
  }

  const items = JSON.parse(order.items);
  const itemsHtml = items
    .map((i) => `<li>${escapeHtml(i.qty)} x ${escapeHtml(i.name)}</li>`)
    .join('');

  const statusLabel = t(ORDER_STATUS_LABEL[order.status] || ORDER_STATUS_LABEL.submitted);

  let shipmentHtml = '';
  if (order.shipment_id) {
    const shipment = await getShipment(env.DB, order.shipment_id);
    if (shipment) {
      const stageIdx = SHIPMENT_STAGES.indexOf(shipment.status);
      const stepsHtml = SHIPMENT_STAGES.map((stage, i) => {
        const label = t(SHIPMENT_STAGE_LABEL[stage]);
        const marker = i < stageIdx ? '✅' : i === stageIdx ? '📍' : '○';
        return `<li>${marker} ${escapeHtml(label)}</li>`;
      }).join('');
      const heading = lang === 'fr' ? 'Suivi de la cargaison' : 'Shipment tracking';
      shipmentHtml = `<h2>${heading}</h2><ol>${stepsHtml}</ol>`;
    }
  }

  const langSwitch =
    lang === 'fr'
      ? `<a href="/order/${escapeHtml(order.id)}?lang=en">EN</a>`
      : `<a href="/order/${escapeHtml(order.id)}?lang=fr">FR</a>`;

  const orderHeading = lang === 'fr' ? 'Commande' : 'Order';
  const statusHeading = lang === 'fr' ? 'Statut' : 'Status';

  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${orderHeading} ${escapeHtml(order.id)}</title></head>
<body>
<p>${langSwitch}</p>
<h1>${orderHeading} ${escapeHtml(order.id)}</h1>
<p>${statusHeading}: <strong>${escapeHtml(statusLabel)}</strong></p>
<ul>${itemsHtml}</ul>
${shipmentHtml}
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
