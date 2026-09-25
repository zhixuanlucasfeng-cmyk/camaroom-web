(function () {
  var STORAGE_KEY = 'restar_cart';
  var Checkout = window.RSCartCheckout;

  function load() {
    return Checkout.loadCountryCart(localStorage, window.RS_COUNTRY);
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      country: window.RS_COUNTRY,
      items: items
    }));
  }

  var items = load();

  function add(item) {
    var storedItems = load();
    if (storedItems.length !== items.length || storedItems.some(function (saved, index) {
      return !items[index] || saved.sku !== items[index].sku || saved.qty !== items[index].qty;
    })) {
      items = storedItems;
    }
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
          '<li class="cart-row" data-sku="' + Checkout.escapeHTML(i.sku) + '">' +
          '<span class="cart-row-name">' + Checkout.escapeHTML(i.name) + '</span>' +
          '<span class="cart-row-qty">x' + i.qty + '</span>' +
          '<button class="cart-row-remove" data-sku="' + Checkout.escapeHTML(i.sku) + '" type="button">&times;</button>' +
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
    var countryLine = (typeof t === 'function')
      ? '<p style="margin:0 0 10px;font-size:13px;color:#555">' + t('country.deliverTo') + '</p>'
      : '';
    drawer.innerHTML =
      countryLine +
      '<form id="cart-contact-form">' +
      '<input id="cart-name" placeholder="Name" required>' +
      '<input id="cart-phone" placeholder="WhatsApp number (with country code)" required>' +
      '<button type="submit" class="btn btn--sun">Submit</button>' +
      '</form><p id="cart-submit-error"></p>';

    var form = document.getElementById('cart-contact-form');
    var submitButton = form.querySelector('button[type="submit"]');
    var originalButtonText = submitButton.textContent;
    var submitter = Checkout.createSubmitter({
      fetch: window.fetch.bind(window),
      onPending: function (pending) {
        submitButton.disabled = pending;
        submitButton.textContent = pending ? 'Submitting…' : originalButtonText;
      },
      onError: function (message) {
        var errorEl = document.getElementById('cart-submit-error');
        if (errorEl) errorEl.textContent = 'Error: ' + message;
      },
      onSuccess: function (data, input) {
        var summary = input.items.map(function (i) { return i.qty + 'x ' + i.name; }).join(', ');
        var waText = encodeURIComponent(
          'Hello Restar Solar, I would like a quote for: ' + summary + ' (order ' + data.order_number + ')'
        );
        if (window.RS_COUNTRY === input.country) clear();
        try {
          window.open('https://wa.me/' + input.whatsappNumber + '?text=' + waText, '_blank');
        } catch (error) {
          // The order is already recorded even if the browser blocks WhatsApp.
        }
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('cart-submit-error').textContent = '';
      submitter.submit(Checkout.runtimeOrderInput(
        window,
        document.getElementById('cart-name').value,
        document.getElementById('cart-phone').value,
        items.slice()
      ));
    });
  }

  window.Cart = { add: add, remove: remove, list: list, clear: clear, count: count, renderDrawer: renderDrawer };

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('cart-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var drawer = document.getElementById('cart-drawer');
        drawer.classList.toggle('open');
      });
    }
    if (typeof updateCartToggle === 'function') updateCartToggle();
    renderDrawer();
  });
})();
