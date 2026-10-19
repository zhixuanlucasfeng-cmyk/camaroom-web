(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RSCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CATEGORY_MAP = {
    solar_panels: 'panel', solar_panel: 'panel', panels: 'panel', panel: 'panel',
    batteries: 'battery', battery: 'battery',
    inverters: 'inverter', inverter: 'inverter',
    charge_controllers: 'controller', charge_controller: 'controller', controllers: 'controller', controller: 'controller',
    energy_storage: 'ess', energy_storage_systems: 'ess', ess: 'ess',
    solar_lights: 'light', street_lights: 'light', lighting: 'light', lights: 'light', light: 'light',
    water_pumps: 'pump', solar_pumps: 'pump', pumps: 'pump', pump: 'pump',
    solar_kits: 'kit', kits: 'kit', kit: 'kit',
    air_conditioners: 'ac', air_conditioning: 'ac', ac: 'ac',
    fans: 'fan', fan: 'fan',
    refrigerators: 'fridge', refrigeration: 'fridge', fridges: 'fridge', fridge: 'fridge'
  };

  function normalized(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function mapCategory(category, subcategory) {
    var primary = normalized(category);
    var secondary = normalized(subcategory);
    if (primary === 'other' && CATEGORY_MAP[secondary]) return CATEGORY_MAP[secondary];
    return CATEGORY_MAP[primary] || CATEGORY_MAP[secondary] || 'kit';
  }

  function compactText(value) {
    if (Array.isArray(value)) value = value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value).split(/\r?\n/).map(function (part) { return part.trim(); }).filter(Boolean).join(', ');
  }

  // Translate known catalogue prose only, never model identifiers or technical values.
  // New free-form descriptions need an explicit French translation, not guessed specs.
  var FRENCH_DESCRIPTION = {
    home_backup: 'Alimentation de secours pour la maison',
    shop_fridge: 'Réfrigération pour les boutiques et commerces',
    borehole_pump: 'Pompage d’eau et alimentation des forages',
    street_lighting: 'Éclairage public et extérieur',
    business_ess: 'Stockage d’énergie pour les entreprises',
    high_efficiency: 'Installations à haut rendement',
    business_high_watt: 'Grandes installations solaires commerciales',
    lifepo4: 'Stockage lithium longue durée',
    'Solar Pump Inverter': 'Onduleur pour pompe solaire',
    'On-Grid Inverter': 'Onduleur raccordé au réseau',
    'Off-Grid Inverter': 'Onduleur hors réseau',
    'Hybrid Inverter': 'Onduleur hybride',
    'Other Inverter': 'Autre onduleur',
    'AGM Battery': 'Batterie AGM',
    'GEL Battery': 'Batterie GEL',
    'Lithium battery': 'Batterie au lithium',
    'MPPT Controller': 'Régulateur MPPT',
    'PWM Controller': 'Régulateur PWM',
    'WiFi Monitoring': 'Suivi par WiFi',
    'Built-in BMS': 'BMS intégré',
    'All-in-One': 'Tout-en-un',
    'Bifacial': 'Bifacial',
    'Black Frame': 'Cadre noir',
    'Full Black': 'Entièrement noir',
    'Dual Glass': 'Double verre'
  };

  function frenchDescription(value) {
    return compactText(value).split(', ').map(function (part) {
      return Object.prototype.hasOwnProperty.call(FRENCH_DESCRIPTION, part) ? FRENCH_DESCRIPTION[part] : part;
    }).join(', ');
  }

  function addSpec(target, label, value) {
    var text = compactText(value);
    if (text) target[label] = text;
  }

  function buildSpecs(row) {
    var en = {};
    var fr = {};
    var ar = {};
    var fields = [
      ['Model', 'Modèle', 'الموديل', row.model],
      ['Wattage', 'Puissance (W)', 'القدرة بالواط', row.wattage],
      ['Power', 'Puissance', 'القدرة', row.power_kw],
      ['Capacity (Ah)', 'Capacité (Ah)', 'السعة (Ah)', row.capacity_ah],
      ['Capacity (kWh)', 'Capacité (kWh)', 'السعة (kWh)', row.capacity_kwh],
      ['Voltage', 'Tension', 'الجهد', row.voltage],
      ['Dimensions', 'Dimensions', 'الأبعاد', row.dimensions],
      ['Features', 'Caractéristiques', 'الميزات', row.features],
      ['Use cases', "Cas d'utilisation", 'الاستخدامات', row.use_cases]
    ];
    fields.forEach(function (field) {
      addSpec(en, field[0], field[3]);
      addSpec(fr, field[1], ['Use cases', 'Features'].includes(field[0]) ? frenchDescription(field[3]) : field[3]);
      addSpec(ar, field[2], field[3]);
    });
    return { en: en, fr: fr, ar: ar };
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function adaptProduct(row, country) {
    row = row || {};
    var sku = compactText(row.sku) || String(row.id || '');
    var primaryImage = compactText(row.image);
    var gallery = [];
    [primaryImage].concat(Array.isArray(row.images) ? row.images : []).forEach(function (url) {
      if (url && gallery.indexOf(url) === -1) gallery.push(url);
    });
    var description = compactText(row.use_cases) || compactText(row.features) || compactText(row.subcategory) || '';
    var hasCountry = !!row.country;
    var localPrice = hasCountry ? finiteNumber(row.price_local) : null;
    var legacyXaf = hasCountry && !Object.prototype.hasOwnProperty.call(row, 'price_local') &&
      String(country || '').toUpperCase() === 'CM' ? finiteNumber(row.price_xaf) : null;
    var useLegacyXaf = legacyXaf !== null;
    var currency = hasCountry && typeof row.currency === 'string' ? row.currency : null;

    return {
      id: sku,
      sku: sku,
      backendId: row.id,
      country: row.country == null ? null : row.country,
      cat: mapCategory(row.category, row.subcategory),
      subcategory: row.subcategory || null,
      img: primaryImage || gallery[0] || '',
      gallery: gallery,
      name: row.name || row.model || sku,
      price: localPrice === null ? legacyXaf : localPrice,
      currency: useLegacyXaf ? 'XAF' : currency,
      stock: finiteNumber(row.stock),
      desc: { en: description, fr: frenchDescription(description), ar: description },
      specs: buildSpecs(row),
      featured: !!row.featured,
      datasheet: row.datasheet || null,
      remote: true
    };
  }

  function adaptCatalog(rows, country) {
    var products = rows.map(function (row) { return adaptProduct(row, country); });
    var inventory = {};
    rows.forEach(function (row, index) {
      // Shared catalog rows are available in every country, but their stock is
      // not owned by any one country and is therefore never locally tracked.
      if (row.country == null) return;
      var stock = finiteNumber(row.stock);
      if (stock === null) return;
      inventory[products[index].id] = stock;
    });
    return { products: products, inventory: inventory };
  }

  function fallbackCatalog(products, country) {
    var showXaf = String(country || '').toUpperCase() === 'CM';
    return {
      products: products.map(function (product) {
        var copy = Object.assign({}, product);
        copy.price = showXaf ? product.price : null;
        return copy;
      }),
      inventory: {}
    };
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Quoting every generated attribute and encoding the five HTML metacharacters
  // gives text and attribute interpolation one consistent trust boundary.
  function escapeAttr(value) {
    return escapeHTML(value);
  }

  function assetUrl(product, path) {
    if (!path) return '';
    var value = String(path).trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (product && product.remote) return '';
    if (value.charAt(0) === '/') return value;
    if (value.indexOf('assets/products/') === 0) return value;
    return 'assets/products/' + value;
  }

  function createLoader(options) {
    options = options || {};
    var request = options.fetch;
    var baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
    var fallbackProducts = options.fallbackProducts || [];
    var generation = 0;

    function load(country) {
      var mine = ++generation;
      var code = String(country || '').toUpperCase();
      var url = baseUrl + '/api/products?country=' + encodeURIComponent(code);
      var timer;
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var pending = Promise.resolve()
        .then(function () { return request(url, controller ? { signal: controller.signal } : undefined); })
        .then(function (response) {
          if (!response || !response.ok) throw new Error('catalog_http_' + (response && response.status));
          return response.json();
        });
      var deadline = new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(new Error('catalog_timeout'));
          if (controller) controller.abort();
        }, options.timeoutMs || 8000);
      });
      return Promise.race([pending, deadline])
        .then(function (rows) {
          if (!Array.isArray(rows)) throw new Error('catalog_invalid_payload');
          if (mine !== generation) return { stale: true };
          var result = adaptCatalog(rows, code);
          result.source = 'remote';
          result.stale = false;
          return result;
        })
        .catch(function () {
          if (mine !== generation) return { stale: true };
          var result = fallbackCatalog(fallbackProducts, code);
          result.source = 'fallback';
          result.stale = false;
          return result;
        }).finally(function () { clearTimeout(timer); });
    }

    return { load: load };
  }

  return {
    mapCategory: mapCategory,
    adaptProduct: adaptProduct,
    adaptCatalog: adaptCatalog,
    fallbackCatalog: fallbackCatalog,
    escapeHTML: escapeHTML,
    escapeAttr: escapeAttr,
    assetUrl: assetUrl,
    createLoader: createLoader
  };
});
