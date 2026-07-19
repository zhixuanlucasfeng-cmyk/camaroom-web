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
