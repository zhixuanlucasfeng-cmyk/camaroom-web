(function () {
  'use strict';

  var navToggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  var countries = window.RSCountries;
  var resolved = countries && countries.resolveCountrySync ? countries.resolveCountrySync() : null;
  var countryCode = resolved ? resolved.code : 'CM';
  var params = new URLSearchParams(window.location.search);
  var explicit = countries && countries.normalize ? countries.normalize(params.get('country')) : null;
  if (explicit) countryCode = explicit;

  document.querySelectorAll('a[data-local-link]').forEach(function (link) {
    var url = new URL(link.getAttribute('href'), window.location.href);
    url.searchParams.set('country', countryCode);
    link.href = url.pathname + url.search + url.hash;
  });

  var countryLabel = document.querySelector('[data-country-label]');
  if (countryLabel && countries && countries.COUNTRIES[countryCode]) {
    var current = countries.COUNTRIES[countryCode];
    countryLabel.textContent = current.flag + ' ' + current.name;
  }

  var socialWhatsapp = document.getElementById('social-whatsapp');
  if (socialWhatsapp && countries && countries.COUNTRIES[countryCode]) {
    var socialCountry = countries.COUNTRIES[countryCode];
    var socialContact = socialCountry.contacts[socialCountry.order_contact] || socialCountry.contacts[0];
    if (socialContact && socialContact.phone) {
      socialWhatsapp.href = 'https://wa.me/' + socialContact.phone;
    }
  }

  var productGrid = document.getElementById('product-grid');
  var productFilters = document.getElementById('product-filters');
  var categoryNames = {
    all: 'All Products', panel: 'Solar Panel', battery: 'Solar Battery', inverter: 'Solar Inverter',
    ess: 'ESS', controller: 'Solar Charge Controller', light: 'Solar Street Light',
    fan: 'Solar Fan', fridge: 'Solar Refrigerator', ac: 'Solar Air Conditioner', pump: 'Solar Water Pump',
    kit: 'Solar Kit', other: 'Other Solar Products'
  };

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function visibleProducts() {
    return typeof PRODUCTS === 'undefined' ? [] : PRODUCTS.filter(function (product) { return !product.hidden; });
  }

  function renderProducts(category) {
    if (!productGrid) return;
    var rows = visibleProducts().filter(function (product) { return category === 'all' || product.cat === category; });
    productGrid.innerHTML = rows.map(function (product) {
      var spec = product.specs && product.specs.en ? product.specs.en : {};
      var detail = spec.Power || spec.Capacity || spec.Voltage || '';
      return '<article class="content-card product-card">' +
        '<img loading="lazy" src="assets/products/' + safe(product.img) + '" alt="' + safe(product.name) + '">' +
        '<div class="content-card-body"><div class="meta">' + safe(categoryNames[product.cat] || categoryNames.other) + '</div>' +
        '<h2>' + safe(product.name) + '</h2>' +
        (detail ? '<p>' + safe(detail) + '</p>' : '') +
        '<a class="action" data-local-link href="index.html?country=' + encodeURIComponent(countryCode) + '#products">Inquire Now →</a></div></article>';
    }).join('') || '<p class="empty">No products</p>';
  }

  if (productGrid && productFilters) {
    var categories = ['all'].concat(Array.from(new Set(visibleProducts().map(function (product) { return product.cat; }))));
    productFilters.innerHTML = categories.map(function (category, index) {
      return '<button type="button" data-category="' + safe(category) + '" class="' + (index === 0 ? 'active' : '') + '">' + safe(categoryNames[category] || categoryNames.other) + '</button>';
    }).join('');
    productFilters.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-category]');
      if (!button) return;
      productFilters.querySelectorAll('button').forEach(function (item) { item.classList.remove('active'); });
      button.classList.add('active');
      renderProducts(button.dataset.category);
    });
    renderProducts('all');
  }

  var quoteForm = document.getElementById('quote-form');
  if (quoteForm && countries) {
    var countrySelect = document.getElementById('quote-country');
    var status = document.getElementById('quote-status');
    countrySelect.innerHTML = countries.ORDER.map(function (code) {
      var option = countries.COUNTRIES[code];
      return '<option value="' + code + '"' + (code === countryCode ? ' selected' : '') + '>' + safe(option.flag + ' ' + option.name) + '</option>';
    }).join('');

    quoteForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var code = countrySelect.value;
      var country = countries.COUNTRIES[code] || countries.COUNTRIES.OTHER;
      var fallbackContact = country.contacts[country.order_contact] || country.contacts[0];
      var phone = fallbackContact.phone;
      status.textContent = 'Opening WhatsApp…';

      if (country.sales_rep_backend) {
        var session = localStorage.getItem('rs_session_id');
        if (!session) {
          session = 'rs-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
          localStorage.setItem('rs_session_id', session);
        }
        var loader = countries.createSalesRepLoader({ fetch: window.fetch.bind(window) });
        var assigned = await loader.load(country, session, phone, [{ phone: phone, label: fallbackContact.name }]);
        if (!assigned.stale && assigned.phone) phone = assigned.phone;
      }

      var name = document.getElementById('quote-name').value.trim();
      var contact = document.getElementById('quote-contact').value.trim();
      var subject = document.getElementById('quote-subject').value.trim();
      var message = document.getElementById('quote-message').value.trim();
      var text = ['Request a quote', 'Country: ' + country.name, 'Name: ' + name, 'Phone or email: ' + contact, 'Subject: ' + subject, '', message].join('\n');
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      status.textContent = 'WhatsApp opened with your request.';
    });
  }
})();
