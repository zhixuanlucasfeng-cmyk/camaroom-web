/* Country configuration for the unified restarsolar.net site.
 *
 * Every value here was migrated from scripts/generate_country_site.py (the
 * build-time generator this replaces) or from index.html's Cameroon baseline.
 * Nothing in this table is invented: a country without a confirmed local rep
 * gets the shared China-sales contact, never a placeholder number — see the
 * SP-137 / 237600000000 incidents in this repo's git history.
 *
 * Country codes match app/countries.py in rest-solar-agent; the backend
 * rejects anything else, so OTHER deliberately has no handoff country and
 * falls back to WhatsApp instead.
 */
(function (root) {
  'use strict';

  var TOM_YANG = {
    name: 'Tom Yang', flag: '🇨🇳', label: 'China sales',
    phone: '8618707737002', phone_display: '+86 187 0773 7002'
  };

  var COUNTRIES = {
    CM: {
      code: 'CM', name: 'Cameroon', name_fr: 'Cameroun', name_ar: 'الكاميرون', fr_in: "au Cameroun", fr_of: "du Cameroun", flag: '🇨🇲',
      lang: 'en', currency: 'XAF',
      address: 'Rue Léman, Douala, Cameroon',
      sales_rep_backend: null,
      contacts: [
        { name: 'Luc Su', flag: '🇨🇲', label: 'Cameroon', phone: '237681105611', phone_display: '+237 681 105 611' },
        TOM_YANG
      ],
      // Index into contacts[] for the top utility bar / footer phone. Cameroon
      // intentionally shows Tom Yang there, matching the pre-unification site.
      config_contact: 1,
      // The wa.me target for cart orders and the chat's first "Send to X"
      // button. Overridden at runtime by /api/sales-rep where a rep pool
      // exists (see applyCountry in index.html).
      order_contact: 0
    },
    ML: {
      code: 'ML', name: 'Mali', name_fr: 'Mali', name_ar: 'مالي', fr_in: "au Mali", fr_of: "du Mali", flag: '🇲🇱',
      lang: 'fr', currency: 'XOF',
      address: "Sis à l'immeuble à Sotuba Rond-Point, près de Shell, Bamako, Mali",
      sales_rep_backend: 'https://camaroom-cart-backend-mali.zhixuanlucasfeng.workers.dev',
      // Mali's local side is a 5-person rep pool assigned per session by
      // /api/sales-rep (seeded in backend/scripts/seed_mali_sales_reps.sql),
      // not a single named badge — so only Elena is listed statically.
      contacts: [
        { name: 'Elena', flag: '🇨🇳', label: 'China sales', phone: '8615851496160', phone_display: '+86 158 5149 6160' }
      ],
      config_contact: 0,
      order_contact: 0
    },
    NG: {
      code: 'NG', name: 'Nigeria', name_fr: 'Nigeria', name_ar: 'نيجيريا', fr_in: "au Nigeria", fr_of: "du Nigeria", flag: '🇳🇬',
      lang: 'en', currency: 'NGN',
      address: 'RESTAR SOLAR ENERGY NIGERIA CO LTD, No 22 Olojo Drive, by Church Bus Stop, Ojo - Alaba International Market Road, Ojo Town, Ojo Local Government Area, Lagos State, Nigeria',
      sales_rep_backend: null,
      contacts: [
        { name: 'Bright', flag: '🇳🇬', label: 'Nigeria', phone: '2349063612011', phone_display: '+234 906 361 2011' },
        { name: 'James', flag: '🇨🇳', label: 'China sales', phone: '2349161101749', phone_display: '+234 916 110 1749' }
      ],
      // 2026-08-14: the top bar shows James, not Bright.
      config_contact: 1,
      order_contact: 0
    },
    SD: {
      code: 'SD', name: 'Sudan', name_fr: 'Soudan', name_ar: 'السودان', fr_in: "au Soudan", fr_of: "du Soudan", flag: '🇸🇩',
      lang: 'ar', currency: 'SDG',
      // No store yet — the contact section shows the country name instead of
      // inventing a street address.
      address: null,
      sales_rep_backend: null,
      // 2026-08-13: Tom Yang was removed from Sudan ("Tom is Cameroon's").
      contacts: [
        {
          name: 'Zhang Gang', flag: '🇸🇩', label: 'Sudan',
          phone: '8618825187185', phone_display: '+86 188 2518 7185',
          // Confirmed line, but not confirmed as WhatsApp-reachable — shown
          // as plain text, never as a wa.me link.
          secondary_display: '+249 91 534 8323'
        }
      ],
      config_contact: 0,
      order_contact: 0
    },
    OTHER: {
      // The prose name: it lands inside sentences like "Delivery across
      // {country}", so it must read as a place. The switcher shows
      // "Other country" instead — see option_key.
      code: 'OTHER', name: 'Africa', name_fr: 'Afrique', name_ar: 'أفريقيا', fr_in: "en Afrique", fr_of: "d'Afrique", flag: '🌍',
      // Not a place we have a presence in, so the contact block shows no
      // location row at all rather than a continent under "Location".
      show_address: false,
      option_key: 'country.otherOption',
      lang: 'en', currency: null,
      address: null,
      sales_rep_backend: null,
      contacts: [TOM_YANG],
      config_contact: 0,
      order_contact: 0
    }
  };

  // Display order in the switcher; OTHER last.
  var ORDER = ['CM', 'ML', 'NG', 'SD', 'OTHER'];

  var STORAGE_KEY = 'rs_country';

  // localStorage throws in private-mode Safari and when site data is blocked,
  // which must never take the page down with it.
  function storageGet(key) {
    try { return root.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { root.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function normalize(code) {
    if (!code) return null;
    var upper = String(code).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(COUNTRIES, upper) ? upper : null;
  }

  /* The rungs that need no network: the URL parameter, then the visitor's
   * remembered choice. Split out so the page can settle the country BEFORE
   * its first render instead of painting one country and swapping to another
   * a moment later. Returns null when only an IP lookup can answer.
   */
  function resolveCountrySync(deps) {
    deps = deps || {};
    var search = deps.search !== undefined ? deps.search : (root.location ? root.location.search : '');
    var get = deps.storageGet || storageGet;
    var set = deps.storageSet || storageSet;

    var fromUrl = null;
    try {
      fromUrl = normalize(new URLSearchParams(search).get('country'));
    } catch (e) { fromUrl = null; }
    if (fromUrl) {
      try { set(STORAGE_KEY, fromUrl); } catch (e) { /* storage blocked */ }
      return { code: fromUrl, source: 'url' };
    }

    // Guarded here rather than only inside the default storageGet: an injected
    // reader (tests, or any future caller) can throw too, and a blocked
    // localStorage must cost us the stored preference, not the page.
    var stored = null;
    try { stored = normalize(get(STORAGE_KEY)); } catch (e) { stored = null; }
    if (stored) return { code: stored, source: 'stored' };

    return null;
  }

  /* Resolves the country to render, first valid source wins:
   *   1. ?country=xx in the URL (also remembered for next time)
   *   2. the visitor's stored previous choice
   *   3. IP lookup via /api/geo
   *   4. OTHER
   * An unrecognised code at any level is skipped, not treated as an error.
   * Resolves to {code, source} — the caller needs the source to decide
   * whether to explain the choice: a guess from the visitor's IP warrants the
   * first-visit notice, an explicit link or a remembered choice does not.
   *
   * `deps` is injected by the tests; the browser gets the real thing.
   */
  function resolveCountry(deps) {
    deps = deps || {};
    var search = deps.search !== undefined ? deps.search : (root.location ? root.location.search : '');
    var get = deps.storageGet || storageGet;
    var set = deps.storageSet || storageSet;
    var geo = deps.geo || fetchGeoCountry;

    var immediate = resolveCountrySync(deps);
    if (immediate) return Promise.resolve(immediate);

    return Promise.resolve()
      .then(geo)
      .then(function (code) { return { code: normalize(code) || 'OTHER', source: 'geo' }; })
      .catch(function () { return { code: 'OTHER', source: 'geo' }; });
  }

  /* Cloudflare knows the visiting IP's country. Two sources, tried in order:
   *
   *   1. /api/geo — functions/api/geo.js, same-origin, but only runs when the
   *      site is hosted on Cloudflare Pages.
   *   2. the cart Worker's /cdn-cgi/trace — Cloudflare serves this on every
   *      workers.dev host with an open CORS policy, so it answers from GitHub
   *      Pages too. Still the account's own infrastructure, not a third-party
   *      geolocation service, and it is sent no data about the visitor beyond
   *      the request they are already making.
   */
  var GEO_SOURCES = [
    {
      url: '/api/geo',
      read: function (res) { return res.json().then(function (d) { return d && d.country; }); }
    },
    {
      url: 'https://camaroom-cart-backend.zhixuanlucasfeng.workers.dev/cdn-cgi/trace',
      read: function (res) { return res.text().then(parseTrace); }
    }
  ];

  // Cloudflare's trace is plain "key=value" lines; loc is the country code.
  function parseTrace(text) {
    var match = /^loc=([A-Za-z]{2})$/m.exec(String(text));
    return match ? match[1].toUpperCase() : null;
  }

  function fetchGeoCountry() {
    if (typeof root.fetch !== 'function') return Promise.resolve(null);
    var settled = false;
    return new Promise(function (resolve) {
      function finish(value) {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        resolve(value || null);
      }
      // One budget for the whole lookup however many sources it tries: a slow
      // edge costs the visitor a brief OTHER render, never a hung page. It is
      // 3s rather than the 1.5s a same-origin /api/geo needed, because the
      // fallback is a cross-origin request whose first TLS handshake measured
      // over 1.5s on a cold connection — too tight a budget silently answered
      // OTHER for exactly the first-time visitors this lookup exists for. The
      // page is already interactive throughout; only the preselected country
      // waits on this.
      var timer = root.setTimeout(function () { finish(null); }, 3000);

      function tryFrom(i) {
        if (settled) return;
        if (i >= GEO_SOURCES.length) { finish(null); return; }
        var source = GEO_SOURCES[i];
        root.fetch(source.url)
          .then(function (res) { return res.ok ? source.read(res) : null; })
          .then(function (code) { if (code) { finish(code); } else { tryFrom(i + 1); } })
          .catch(function () { tryFrom(i + 1); });
      }
      tryFrom(0);
    });
  }

  /* Mali's existing Worker owns only its session-consistent sales-rep pool.
   * Product, inventory and order traffic stays on the central agent backend.
   * Starting any newer country load invalidates an older response, including
   * a switch to a country that has no sales-rep backend and makes no request.
   */
  function createSalesRepLoader(options) {
    options = options || {};
    var request = options.fetch;
    var generation = 0;

    function load(country, session, fallbackPhone, fallbackTargets) {
      var mine = ++generation;
      var base = String((country && country.sales_rep_backend) || '').replace(/\/$/, '');
      var fallback = {
        stale: false,
        phone: fallbackPhone,
        targets: fallbackTargets,
        source: 'fallback'
      };
      if (!base || typeof request !== 'function') return Promise.resolve(fallback);

      var url = base + '/api/sales-rep?session=' + encodeURIComponent(session || '') + '&source=page_load';
      return Promise.resolve()
        .then(function () { return request(url); })
        .then(function (response) {
          if (!response || !response.ok) throw new Error('sales_rep_http_' + (response && response.status));
          return response.json();
        })
        .then(function (rep) {
          if (mine !== generation) return { stale: true };
          if (!rep || !rep.phone) return fallback;
          var targets = (fallbackTargets || []).slice();
          if (targets.length) {
            targets[targets.length - 1] = {
              phone: String(rep.phone),
              label: rep.name || targets[targets.length - 1].label
            };
          }
          return {
            stale: false,
            phone: String(rep.phone),
            targets: targets,
            source: 'remote'
          };
        })
        .catch(function () {
          return mine !== generation ? { stale: true } : fallback;
        });
    }

    return { load: load };
  }

  var API = {
    COUNTRIES: COUNTRIES,
    ORDER: ORDER,
    STORAGE_KEY: STORAGE_KEY,
    normalize: normalize,
    resolveCountry: resolveCountry,
    resolveCountrySync: resolveCountrySync,
    createSalesRepLoader: createSalesRepLoader,
    parseTrace: parseTrace,
    storageGet: storageGet,
    storageSet: storageSet
  };

  root.RSCountries = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
