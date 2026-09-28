const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Catalog = require('../assets/js/catalog.js');
const Countries = require('../assets/js/countries.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const priceCode = html.slice(html.indexOf('const priceHTML ='), html.indexOf('const wa ='));
const renderCode = html.slice(html.indexOf('function renderGrid(){'), html.indexOf('function closeModal(){'));

function renderPrices(product, country) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', style: { setProperty() {} },
      classList: { add() {} }, querySelectorAll: () => [],
    });
    return elements.get(id);
  };
  const document = {
    getElementById: element,
    querySelectorAll: () => [],
    body: { style: {} },
  };
  const context = {
    document,
    window: { CART_ENABLED: false },
    RSCatalog: Catalog,
    RSCountries: Countries,
    catalogHTML: Catalog.escapeHTML,
    catalogAttr: Catalog.escapeAttr,
    CATALOG_PRODUCTS: [product],
    COUNTRY: country,
    INVENTORY: {},
    LOW_STOCK_THRESHOLD: 5,
    CAT_COLOR: { panel: '#123456' },
    ICON: { panel: '<svg></svg>', kit: '<svg></svg>' },
    activeCat: 'all',
    lang: 'en',
    catLabel: () => 'Solar panels',
    tr: value => value.en,
    fmt: value => value.toLocaleString('fr-FR'),
    t: key => key,
    wa: value => 'https://wa.me/?text=' + encodeURIComponent(value),
  };
  vm.runInNewContext(priceCode + renderCode + '\nrenderGrid(); openModal("TEST-1");', context);
  return { grid: element('grid').innerHTML, modal: element('mPrice').innerHTML };
}

function product(fields) {
  return {
    id: 'TEST-1', name: 'Panel', cat: 'panel', img: '', gallery: [],
    desc: { en: 'Panel' }, specs: { en: {} }, price: 850000,
    ...fields,
  };
}

test('grid and modal display the API product currency', () => {
  const { grid, modal } = renderPrices(product({ currency: 'NGN' }), 'NG');
  assert.match(grid, /850[\s\u202f]000 <small>NGN<\/small>/);
  assert.match(modal, /850[\s\u202f]000 <small>NGN<\/small>/);
  assert.doesNotMatch(grid + modal, /FCFA/);
});

test('old bundled products use the selected country currency when they have a price', () => {
  const { grid, modal } = renderPrices(product({ price: 25000 }), 'CM');
  assert.match(grid, /<small>XAF<\/small>/);
  assert.match(modal, /<small>XAF<\/small>/);
});

test('grid and modal escape API-provided currency text', () => {
  const { grid, modal } = renderPrices(product({ currency: '<img src=x onerror=alert(1)>' }), 'NG');
  assert.match(grid, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(modal, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(grid + modal, /<img src=x onerror=/);
});
