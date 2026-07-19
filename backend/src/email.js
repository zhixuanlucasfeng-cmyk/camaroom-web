export async function sendPaidNotification(order, env) {
  const items = JSON.parse(order.items);
  const itemsText = items.map((i) => `${i.qty} x ${i.name}`).join(', ');
  const text =
    `Order ${order.id} paid.\n` +
    `Customer: ${order.customer_name} (${order.customer_phone})\n` +
    `Amount: ${order.quoted_price} ${order.currency}\n` +
    `Items: ${itemsText}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.NOTIFICATION_FROM_EMAIL,
      to: env.SALES_NOTIFICATION_EMAIL,
      subject: `Payment received — order ${order.id}`,
      text,
    }),
  });
}
