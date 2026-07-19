export async function createPaymentLink({ amount, currency, txRef, customerName, customerPhone }, env) {
  const res = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: env.PAYMENT_REDIRECT_URL,
      customer: {
        name: customerName,
        phonenumber: customerPhone,
      },
      customizations: {
        title: 'Restar Solar Cameroon',
      },
    }),
  });
  const data = await res.json();
  if (data.status !== 'success' || !data.data || !data.data.link) {
    throw new Error('flutterwave_link_failed');
  }
  return data.data.link;
}
