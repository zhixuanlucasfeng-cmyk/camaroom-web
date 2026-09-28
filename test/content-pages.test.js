const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Catalog = require('../assets/js/catalog.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const PAGES = ['products.html', 'projects.html', 'news.html', 'downloads.html', 'faq.html', 'contact.html'];

test('the official content areas have separate responsive pages', () => {
  for (const page of PAGES) {
    assert.equal(fs.existsSync(path.join(root, page)), true, `${page} is missing`);
    const html = read(page);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/, page);
    assert.match(html, /assets\/css\/content-pages\.css/, page);
    assert.match(html, /class="site-header"/, page);
    assert.match(html, /class="site-footer"/, page);
  }
});

test('every public page exposes the same official navigation', () => {
  for (const page of ['index.html', ...PAGES]) {
    const html = read(page);
    for (const href of ['products.html', 'projects.html', 'downloads.html', 'news.html', 'faq.html', 'contact.html']) {
      assert.match(html, new RegExp(`href="${href.replace('.', '\\.')}`), `${page} lacks ${href}`);
    }
  }
});

test('FAQ page carries the five main-site solar-panel questions and answers', () => {
  const html = read('faq.html');
  for (const text of [
    'What is a solar panel?',
    'What is the difference between polycrystalline and monocrystalline?',
    'What is the application range of solar panel?',
    'What is your warranty policy for solar panels?',
    'How is your package for solar panels?',
  ]) assert.match(html, new RegExp(text.replace(/[?]/g, '\\?')));
  assert.match(html, /25 years linear power output warranty/);
});

test('projects and news use current official titles and authentic main-site images', () => {
  const projects = read('projects.html');
  assert.match(projects, /12 kW Hybrid Inverter &amp; 30 kWh Lithium Battery Hybrid Solar Project in Nigeria/);
  assert.match(projects, /44kVA hybrid inverter &amp; 40kWh lithium battery installation at Bazou town hall in western Cameroon/);
  assert.match(projects, /https:\/\/www\.restarsolar\.com\/data\/watermark\/20260810\/6a79950ca34df\.jpg/);

  const news = read('news.html');
  assert.match(news, /Restar Shines at the Nigeria Energy Exhibition!/);
  assert.match(news, /Sep\. 04, 2026/);
  assert.match(news, /https:\/\/www\.restarsolar\.com\/data\/watermark\/20260904\/6a9a7e2923de4\.jpg/);
});

test('download page links directly to official PDF resources', () => {
  const html = read('downloads.html');
  assert.match(html, /Freezer Refrigerator \(2\)/);
  assert.match(html, /HH3\.6KS 6KS All-in-one System/);
  assert.match(html, /RT-ESSA Series Outdoor Cabinet Energy Storage System/);
  assert.match(html, /https:\/\/www\.restarsolar\.com\/data\/upload\/20260608\/6a262d1c70675\.pdf/);
});

test('contact page includes the official office list and a country-routed quote form', () => {
  const html = read('contact.html');
  const script = read('assets/js/content-pages.js');
  for (const office of ['Headquarters:', 'Dubai Office:', 'Nigeria Showroom:', 'Republic of Mali:', 'Republic of Cameroon:']) {
    assert.match(html, new RegExp(office));
  }
  assert.match(html, /Request a quote/);
  assert.match(html, /id="quote-form"/);
  assert.match(html, /assets\/js\/countries\.js/);
  assert.match(html, /assets\/js\/content-pages\.js/);
  assert.match(html, /id="social-whatsapp"/);
  assert.match(script, /socialWhatsapp\.href = 'https:\/\/wa\.me\/'/);
});

test('products page loads the shared catalog before its page script and keeps official categories', () => {
  const html = read('products.html');
  for (const category of ['Solar Panel', 'Solar Battery', 'Solar Inverter', 'ESS', 'Solar Charge Controller', 'Other Solar Products']) {
    assert.match(html, new RegExp(category));
  }
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, [
    'assets/js/countries.js',
    'assets/data/products.js',
    'assets/js/catalog.js',
    'assets/js/content-pages.js',
  ]);
  assert.match(html, /id="product-grid"/);
});

const remoteRow = {
  id: 12, sku: 'NG-12', country: 'NG', name: '<Panel & Battery>', category: 'solar_panels',
  image: 'https://example.com/a?x="bad"&y=1', price_local: 850000, currency: 'NGN', stock: 3,
};

function productPage(fetch, country = 'NG') {
  const grid = { innerHTML: '' };
  const notice = { textContent: '', hidden: true };
  const countryLabel = { textContent: '' };
  const socialWhatsapp = {
    href: 'index.html#contact',
    getAttribute(name) { return name === 'href' ? this.href : null; },
  };
  const homeLink = {
    href: 'index.html?source=nav#products',
    getAttribute(name) { return name === 'href' ? this.href : null; },
  };
  const filters = {
    innerHTML: '',
    addEventListener(type, callback) { if (type === 'click') this.click = callback; },
    querySelectorAll() { return []; },
  };
  const nodes = { 'product-grid': grid, 'product-filters': filters, 'catalog-notice': notice, 'social-whatsapp': socialWhatsapp };
  const document = {
    querySelector(selector) { return selector === '[data-country-label]' ? countryLabel : selector.startsWith('#') ? nodes[selector.slice(1)] : null; },
    querySelectorAll(selector) { return selector === 'a[data-local-link]' ? [homeLink, socialWhatsapp] : []; },
    getElementById(id) { return nodes[id] || null; },
  };
  const location = { search: `?country=${country}`, href: `https://example.com/products.html?country=${country}` };
  const countries = {
    COUNTRIES: {
      NG: { lang: 'en', currency: 'NGN', flag: '🇳🇬', name: 'Nigeria', order_contact: 0, contacts: [{ phone: '234111' }] },
      CM: { lang: 'en', currency: 'XAF', flag: '🇨🇲', name: 'Cameroon', order_contact: 0, contacts: [{ phone: '237222' }] },
    },
    resolveCountrySync: () => ({ code: country }),
    normalize: code => code === 'NG' || code === 'CM' ? code : null,
  };
  const window = { location, RSCountries: countries, RSCatalog: Catalog, fetch,
    addEventListener(type, callback) { if (type === 'popstate') this.popstate = callback; } };
  const context = {
    document, URL, URLSearchParams, PRODUCTS: [{ id: 'STATIC-1', name: 'Bundled panel', cat: 'panel', img: 'fallback.jpg' }],
    window,
  };
  vm.runInNewContext(read('assets/js/content-pages.js'), context);
  return { grid, notice, filters, location, window, countryLabel, socialWhatsapp, homeLink };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('products page loads current country and renders live price, stock, and escaped remote media', async () => {
  const urls = [];
  const page = productPage(async url => {
    urls.push(url);
    return { ok: true, json: async () => [remoteRow] };
  });
  assert.match(page.grid.innerHTML, /Loading products/);
  await settle();
  assert.deepEqual(urls, ['https://rest-solar-agent-cm.onrender.com/api/products?country=NG']);
  assert.match(page.grid.innerHTML, /&lt;Panel &amp; Battery&gt;/);
  assert.match(page.grid.innerHTML, /850[\s\u202f]000[^<]*NGN/);
  assert.match(page.grid.innerHTML, /Available/);
  assert.match(page.grid.innerHTML, /src="https:\/\/example\.com\/a\?x=&quot;bad&quot;&amp;y=1"/);
  assert.doesNotMatch(page.grid.innerHTML, /assets\/products\/https:/);
  assert.equal(page.notice.hidden, true);
});

test('successful empty feed stays empty and does not show bundled products', async () => {
  const page = productPage(async () => ({ ok: true, json: async () => [] }));
  await settle();
  assert.match(page.grid.innerHTML, /No products/);
  assert.doesNotMatch(page.grid.innerHTML, /Bundled panel/);
  assert.equal(page.notice.hidden, true);
});

test('catalog failure shows bundled products with a nonblocking notice', async () => {
  const page = productPage(async () => { throw new Error('network'); });
  await settle();
  assert.match(page.grid.innerHTML, /Bundled panel/);
  assert.match(page.grid.innerHTML, /Request a quote/);
  assert.doesNotMatch(page.grid.innerHTML, /stock-status/);
  assert.equal(page.notice.hidden, false);
  assert.match(page.notice.textContent, /catalog.*unavailable/i);
  assert.match(page.notice.textContent, /saved products.*prices.*(?:require|need).*confirmation/i);
});

test('zero stock is out of stock and filters still work after the async load', async () => {
  const page = productPage(async () => ({ ok: true, json: async () => [
    { ...remoteRow, stock: 0 },
    { ...remoteRow, id: 13, sku: 'NG-13', name: 'Battery', category: 'batteries', price_local: null, currency: null, stock: null },
  ] }));
  await settle();
  assert.match(page.grid.innerHTML, /Out of stock/);
  assert.match(page.grid.innerHTML, /Request a quote/);
  assert.match(page.filters.innerHTML, /data-category="battery"/);
  page.filters.click({ target: { closest: () => ({ dataset: { category: 'battery' }, classList: { add() {} } }) } });
  assert.match(page.grid.innerHTML, /Battery/);
  assert.doesNotMatch(page.grid.innerHTML, /&lt;Panel &amp; Battery&gt;/);
});

test('an older country response cannot replace a newer country catalog', async () => {
  const responses = {};
  const page = productPage(url => new Promise(resolve => { responses[new URL(url).searchParams.get('country')] = resolve; }));
  await settle();
  page.location.search = '?country=CM';
  page.window.popstate();
  await settle();
  responses.CM({ ok: true, json: async () => [{ ...remoteRow, country: 'CM', sku: 'CM-1', name: 'Cameroon item' }] });
  await settle();
  responses.NG({ ok: true, json: async () => [remoteRow] });
  await settle();
  assert.match(page.grid.innerHTML, /Cameroon item/);
  assert.doesNotMatch(page.grid.innerHTML, /&lt;Panel &amp; Battery&gt;/);
});

test('country reload keeps the loading state when an old filter is clicked', async () => {
  let finishCM;
  const page = productPage(url => new URL(url).searchParams.get('country') === 'NG'
    ? Promise.resolve({ ok: true, json: async () => [remoteRow] })
    : new Promise(resolve => { finishCM = resolve; }));
  await settle();
  assert.match(page.grid.innerHTML, /&lt;Panel &amp; Battery&gt;/);
  const oldButton = { dataset: { category: 'panel' }, classList: { add() {} } };
  page.location.search = '?country=CM';
  page.window.popstate();
  await settle();
  assert.match(page.grid.innerHTML, /Loading products/);
  assert.doesNotMatch(page.filters.innerHTML, /data-category="panel"/);
  page.filters.click({ target: { closest: () => oldButton } });
  assert.match(page.grid.innerHTML, /Loading products/);
  assert.doesNotMatch(page.grid.innerHTML, /&lt;Panel &amp; Battery&gt;/);
  finishCM({ ok: true, json: async () => [{ ...remoteRow, country: 'CM', sku: 'CM-1', name: 'Cameroon item' }] });
  await settle();
  assert.match(page.grid.innerHTML, /Cameroon item/);
});

test('popstate refreshes country label, local links, WhatsApp, and catalog together', async () => {
  const page = productPage(async url => ({ ok: true, json: async () => [{
    ...remoteRow, country: new URL(url).searchParams.get('country'), name: new URL(url).searchParams.get('country') + ' item',
  }] }));
  await settle();
  assert.equal(page.countryLabel.textContent, '🇳🇬 Nigeria');
  assert.equal(page.homeLink.href, '/index.html?source=nav&country=NG#products');
  assert.equal(page.socialWhatsapp.href, 'https://wa.me/234111');

  page.location.search = '?country=CM';
  page.window.popstate();
  await settle();
  assert.equal(page.countryLabel.textContent, '🇨🇲 Cameroon');
  assert.equal(page.homeLink.href, '/index.html?source=nav&country=CM#products');
  assert.equal(page.socialWhatsapp.href, 'https://wa.me/237222');
  assert.match(page.grid.innerHTML, /CM item/);
  assert.doesNotMatch(page.grid.innerHTML, /NG item/);

  page.location.search = '?country=NG';
  page.window.popstate();
  await settle();
  assert.equal(page.homeLink.href, '/index.html?source=nav&country=NG#products');
  assert.equal(page.socialWhatsapp.href, 'https://wa.me/234111');
  assert.match(page.grid.innerHTML, /NG item/);
});

test('official social links are available without fake accounts', () => {
  const html = read('contact.html');
  assert.match(html, /facebook\.com\/profile\.php\?id=100091151491190/);
  assert.match(html, /instagram\.com\/restarsolar_/);
  assert.match(html, /mailto:sales@restarsolar\.com/);
});

test('social icons keep the homepage artwork and order on every content page', () => {
  const expectedIcons = [
    ['Facebook', 'ico-facebook'],
    ['LinkedIn', 'ico-linkedin'],
    ['Instagram', 'ico-instagram'],
    ['Pinterest', 'ico-pinterest'],
    ['Email', 'ico-email'],
    ['WhatsApp', 'ico-whatsapp'],
    ['WeChat', 'ico-wechat'],
  ];

  for (const page of PAGES) {
    const html = read(page);
    const socialBlock = html.match(/<div class="socials"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
    let previousIndex = -1;

    for (const [label, icon] of expectedIcons) {
      const labelIndex = socialBlock.indexOf(`aria-label="${label}"`);
      assert.ok(labelIndex > previousIndex, `${page} must keep ${label} in the homepage order`);
      assert.match(
        socialBlock,
        new RegExp(`aria-label="${label}"[^>]*>[\\s\\S]*?<use href="assets/icons/social-icons\\.svg#${icon}"`),
        `${page} must use the shared ${label} SVG`,
      );
      previousIndex = labelIndex;
    }

    assert.doesNotMatch(socialBlock, />\s*(?:f|ig|wc|wa|@)\s*</i, `${page} must not fall back to text initials`);
  }
});
