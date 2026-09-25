(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RSCartCheckout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadCountryCart(storage, country) {
    try {
      var saved = JSON.parse(storage.getItem('restar_cart') || 'null');
      if (!saved || saved.country !== country || !Array.isArray(saved.items)) return [];
      return saved.items;
    } catch (error) {
      return [];
    }
  }

  function buildPayload(input) {
    var payload = {
      country: input.country,
      customer_name: input.customerName,
      contact: input.contact,
      items: input.items.map(function (item) {
        return { sku: item.sku, qty: item.qty };
      })
    };
    if (input.sessionId) payload.session_id = input.sessionId;
    return payload;
  }

  function runtimeOrderInput(runtime, customerName, contact, items) {
    return {
      baseUrl: runtime.CART_API_BASE,
      country: runtime.RS_COUNTRY,
      customerName: customerName,
      contact: contact,
      items: items,
      sessionId: runtime.CART_SESSION_ID || undefined,
      whatsappNumber: runtime.CART_WHATSAPP_NUMBER
    };
  }

  function apiMessage(data) {
    if (data && typeof data.detail === 'string' && data.detail) return data.detail;
    if (data && typeof data.error === 'string' && data.error) return data.error;
    return 'Order could not be submitted. Please try again.';
  }

  function createSubmitter(options) {
    options = options || {};
    var request = options.fetch;
    var onPending = options.onPending || function () {};
    var onSuccess = options.onSuccess || function () {};
    var onError = options.onError || function () {};
    var pending = false;

    function submit(input) {
      if (pending) return Promise.resolve({ ok: false, duplicate: true });
      pending = true;
      onPending(true);

      var payload = buildPayload(input);
      var url = String(input.baseUrl || '').replace(/\/$/, '') + '/api/orders';
      return Promise.resolve()
        .then(function () {
          return request(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
        })
        .then(function (response) {
          return Promise.resolve(response.json()).catch(function () { return {}; }).then(function (data) {
            if (response.status !== 201 || !data || typeof data.order_number !== 'string' || !data.order_number) {
              var message = apiMessage(data);
              onError(message);
              return { ok: false, error: message };
            }
            onSuccess(data, input);
            return { ok: true, data: data };
          });
        })
        .catch(function () {
          var message = 'Network error, please try again.';
          onError(message);
          return { ok: false, error: message };
        })
        .finally(function () {
          pending = false;
          onPending(false);
        });
    }

    return { submit: submit };
  }

  return {
    escapeHTML: escapeHTML,
    loadCountryCart: loadCountryCart,
    buildPayload: buildPayload,
    runtimeOrderInput: runtimeOrderInput,
    createSubmitter: createSubmitter
  };
});
