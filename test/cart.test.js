const test = require('node:test');
const assert = require('node:assert/strict');

let Checkout = {};
try {
  Checkout = require('../assets/js/cart-checkout.js');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const AGENT_ORIGIN = 'https://rest-solar-agent-cm.onrender.com';

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

test('each managed country posts the exact public order contract to the central backend', async () => {
  assert.equal(typeof Checkout.createSubmitter, 'function', 'cart checkout must be loadable in Node');

  for (const country of ['CM', 'ML', 'NG', 'SD']) {
    const requests = [];
    const submitter = Checkout.createSubmitter({
      fetch: async (url, options) => {
        requests.push({ url, options });
        return response(201, { order_number: `${country}-20260925-0001`, status: 'pending' });
      },
    });

    const result = await submitter.submit({
      baseUrl: `${AGENT_ORIGIN}/`,
      country,
      customerName: 'Ada',
      contact: '+237600000000',
      items: [{ sku: 'BAT-1', name: 'Battery', qty: 2 }],
      sessionId: 'rs-session-1',
    });

    assert.equal(result.ok, true, country);
    assert.equal(requests.length, 1, country);
    assert.equal(requests[0].url, `${AGENT_ORIGIN}/api/orders`, country);
    assert.equal(requests[0].options.method, 'POST', country);
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      country,
      customer_name: 'Ada',
      contact: '+237600000000',
      items: [{ sku: 'BAT-1', qty: 2 }],
      session_id: 'rs-session-1',
    });
  }
});

test('browser order input reads the active country and central base from runtime state', () => {
  const input = Checkout.runtimeOrderInput({
    CART_API_BASE: AGENT_ORIGIN,
    RS_COUNTRY: 'SD',
    CART_SESSION_ID: 'rs-live-session',
    CART_WHATSAPP_NUMBER: '249900000000',
  }, 'Mona', '+249900000000', [{ sku: 'KIT-1', name: 'Kit', qty: 1 }]);

  assert.deepEqual(input, {
    baseUrl: AGENT_ORIGIN,
    country: 'SD',
    customerName: 'Mona',
    contact: '+249900000000',
    items: [{ sku: 'KIT-1', name: 'Kit', qty: 1 }],
    sessionId: 'rs-live-session',
    whatsappNumber: '249900000000',
  });
});

test('session_id is omitted when the chat session is unavailable', async () => {
  let body;
  const submitter = Checkout.createSubmitter({
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return response(201, { order_number: 'CM-20260925-0001', status: 'pending' });
    },
  });

  await submitter.submit({
    baseUrl: AGENT_ORIGIN,
    country: 'CM',
    customerName: 'Ada',
    contact: 'ada@example.com',
    items: [{ sku: 'SP-1', qty: 1 }],
  });

  assert.deepEqual(body, {
    country: 'CM',
    customer_name: 'Ada',
    contact: 'ada@example.com',
    items: [{ sku: 'SP-1', qty: 1 }],
  });
});

test('only a 201 response clears the cart and exposes the returned order number', async () => {
  let clears = 0;
  let success;
  const submitter = Checkout.createSubmitter({
    fetch: async () => response(201, {
      order_number: 'NG-20260925-0007',
      status: 'pending',
      confirmation: 'Recorded',
    }),
    onSuccess: (data, payload) => {
      clears += 1;
      success = { data, payload };
    },
  });

  const result = await submitter.submit({
    baseUrl: AGENT_ORIGIN,
    country: 'NG',
    customerName: 'Chidi',
    contact: '+2348000000000',
    items: [{ sku: 'INV-1', name: 'Inverter', qty: 1 }],
  });

  assert.equal(result.ok, true);
  assert.equal(clears, 1);
  assert.equal(success.data.order_number, 'NG-20260925-0007');
  assert.equal(success.payload.items[0].name, 'Inverter');
});

test('API failure preserves cart state and reports FastAPI detail', async () => {
  let clears = 0;
  let errorMessage = '';
  const submitter = Checkout.createSubmitter({
    fetch: async () => response(409, { detail: 'Insufficient stock for SKU BAT-1' }),
    onSuccess: () => { clears += 1; },
    onError: message => { errorMessage = message; },
  });

  const result = await submitter.submit({
    baseUrl: AGENT_ORIGIN,
    country: 'ML',
    customerName: 'Awa',
    contact: '+22370000000',
    items: [{ sku: 'BAT-1', qty: 5 }],
  });

  assert.deepEqual(result, { ok: false, error: 'Insufficient stock for SKU BAT-1' });
  assert.equal(clears, 0);
  assert.equal(errorMessage, 'Insufficient stock for SKU BAT-1');
});

test('a malformed 201 response does not clear the cart without an order number', async () => {
  let clears = 0;
  let errorMessage = '';
  const submitter = Checkout.createSubmitter({
    fetch: async () => response(201, { status: 'pending' }),
    onSuccess: () => { clears += 1; },
    onError: message => { errorMessage = message; },
  });

  const result = await submitter.submit({
    baseUrl: AGENT_ORIGIN,
    country: 'CM',
    customerName: 'Ada',
    contact: '+237600000000',
    items: [{ sku: 'SP-1', qty: 1 }],
  });

  assert.deepEqual(result, { ok: false, error: 'Order could not be submitted. Please try again.' });
  assert.equal(clears, 0);
  assert.equal(errorMessage, 'Order could not be submitted. Please try again.');
});

test('network failure preserves cart state and restores the submit button', async () => {
  const pendingStates = [];
  let clears = 0;
  let errorMessage = '';
  const submitter = Checkout.createSubmitter({
    fetch: async () => { throw new Error('offline'); },
    onPending: pending => pendingStates.push(pending),
    onSuccess: () => { clears += 1; },
    onError: message => { errorMessage = message; },
  });

  const result = await submitter.submit({
    baseUrl: AGENT_ORIGIN,
    country: 'SD',
    customerName: 'Mona',
    contact: '+249900000000',
    items: [{ sku: 'KIT-1', qty: 1 }],
  });

  assert.deepEqual(result, { ok: false, error: 'Network error, please try again.' });
  assert.deepEqual(pendingStates, [true, false]);
  assert.equal(clears, 0);
  assert.equal(errorMessage, 'Network error, please try again.');
});

test('a second click while an order is pending does not create a duplicate request', async () => {
  let resolveRequest;
  let requestCount = 0;
  const submitter = Checkout.createSubmitter({
    fetch: async () => {
      requestCount += 1;
      return new Promise(resolve => { resolveRequest = resolve; });
    },
  });
  const input = {
    baseUrl: AGENT_ORIGIN,
    country: 'CM',
    customerName: 'Ada',
    contact: '+237600000000',
    items: [{ sku: 'SP-1', qty: 1 }],
  };

  const first = submitter.submit(input);
  const second = await submitter.submit(input);
  assert.deepEqual(second, { ok: false, duplicate: true });
  assert.equal(requestCount, 1);

  resolveRequest(response(201, { order_number: 'CM-20260925-0002', status: 'pending' }));
  assert.equal((await first).ok, true);
});

test('stored cart data is returned only for the active country', () => {
  const storage = {
    getItem: () => JSON.stringify({ country: 'CM', items: [{ sku: 'SP-1', name: 'Panel', qty: 1 }] }),
  };

  assert.deepEqual(Checkout.loadCountryCart(storage, 'CM'), [{ sku: 'SP-1', name: 'Panel', qty: 1 }]);
  assert.deepEqual(Checkout.loadCountryCart(storage, 'NG'), []);
});

test('cart item text is escaped before drawer markup is rendered', () => {
  assert.equal(
    Checkout.escapeHTML('<img src=x onerror="alert(1)">&'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;'
  );
});
