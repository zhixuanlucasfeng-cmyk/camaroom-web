(function () {
  var STORAGE_KEY = 'restar_cart';

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  var items = load();

  function add(item) {
    var existing = items.find(function (i) { return i.sku === item.sku; });
    if (existing) {
      existing.qty += item.qty || 1;
    } else {
      items.push({ sku: item.sku, name: item.name, qty: item.qty || 1 });
    }
    save(items);
    renderDrawer();
  }

  function remove(sku) {
    items = items.filter(function (i) { return i.sku !== sku; });
    save(items);
    renderDrawer();
  }

  function list() {
    return items.slice();
  }

  function clear() {
    items = [];
    save(items);
    renderDrawer();
  }

  function count() {
    return items.reduce(function (sum, i) { return sum + i.qty; }, 0);
  }

  function renderDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var countEl = document.getElementById('cart-count');
    if (countEl) countEl.textContent = String(count());
    if (!drawer) return;

    if (items.length === 0) {
      drawer.innerHTML = '<p class="cart-empty">Cart is empty</p>';
      return;
    }

    var rows = items
      .map(function (i) {
        return (
          '<li class="cart-row" data-sku="' + i.sku + '">' +
          '<span class="cart-row-name">' + i.name + '</span>' +
          '<span class="cart-row-qty">x' + i.qty + '</span>' +
          '<button class="cart-row-remove" data-sku="' + i.sku + '" type="button">&times;</button>' +
          '</li>'
        );
      })
      .join('');

    drawer.innerHTML =
      '<ul class="cart-list">' + rows + '</ul>' +
      '<button id="cart-submit" type="button" class="btn btn--sun">Request quote for cart</button>';

    drawer.querySelectorAll('.cart-row-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        remove(btn.getAttribute('data-sku'));
      });
    });

    var submitBtn = drawer.querySelector('#cart-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        renderContactForm(drawer);
      });
    }
  }

  function renderContactForm(drawer) {
    drawer.innerHTML =
      '<form id="cart-contact-form">' +
      '<input id="cart-name" placeholder="Name" required>' +
      '<input id="cart-phone" placeholder="WhatsApp number (with country code)" required>' +
      '<button type="submit" class="btn btn--sun">Submit</button>' +
      '</form><p id="cart-submit-error"></p>';

    document.getElementById('cart-contact-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitOrder({
        customer_name: document.getElementById('cart-name').value,
        customer_phone: document.getElementById('cart-phone').value,
        currency: window.CART_CURRENCY || 'XAF',
        items: items,
      });
    });
  }

  function submitOrder(payload) {
    var base = window.CART_API_BASE || '';
    fetch(base + '/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          document.getElementById('cart-submit-error').textContent = 'Error: ' + result.data.error;
          return;
        }
        var summary = payload.items.map(function (i) { return i.qty + 'x ' + i.name; }).join(', ');
        var waText = encodeURIComponent(
          'Hello Restar Solar, I would like a quote for: ' + summary + ' (order ' + result.data.id + ')'
        );
        window.open('https://wa.me/' + window.CART_WHATSAPP_NUMBER + '?text=' + waText, '_blank');
        clear();
      })
      .catch(function () {
        document.getElementById('cart-submit-error').textContent = 'Network error, please try again.';
      });
  }

  window.Cart = { add: add, remove: remove, list: list, clear: clear, count: count, renderDrawer: renderDrawer };

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('cart-toggle');
    if (window.CART_ENABLED && toggle) {
      toggle.style.display = '';
      toggle.addEventListener('click', function () {
        var drawer = document.getElementById('cart-drawer');
        drawer.classList.toggle('open');
      });
    }
    renderDrawer();
  });
})();
