const test = require('node:test');
const assert = require('node:assert/strict');

let Catalog = {};
try {
  Catalog = require('../assets/js/catalog.js');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const API_PRODUCT = {
  id: 91,
  sku: 'SP-API-1',
  country: 'CM',
  name: 'RTM300 300W',
  category: 'solar_panels',
  subcategory: 'monocrystalline',
  model: 'RTM300',
  wattage: '300W',
  power_kw: null,
  capacity_ah: null,
  capacity_kwh: null,
  voltage: '24V',
  dimensions: '1650x990x35mm',
  price_cny: 210,
  price_xaf: 25000,
  stock: 4,
  featured: true,
  features: 'TOPCon\nBifacial',
  use_cases: 'Homes\nShops',
  image: 'https://rest-solar-agent-cm.onrender.com/media/10',
  images: [
    'https://rest-solar-agent-cm.onrender.com/media/11',
    'https://rest-solar-agent-cm.onrender.com/media/12',
  ],
  datasheet: 'https://rest-solar-agent-cm.onrender.com/media/13',
};

test('public feed products map to the card shape without rewriting remote media URLs', () => {
  assert.equal(typeof Catalog.adaptCatalog, 'function', 'catalog adapter must be loadable in Node');

  const result = Catalog.adaptCatalog([API_PRODUCT], 'CM');
  assert.equal(result.products.length, 1);
  const product = result.products[0];

  assert.equal(product.id, 'SP-API-1');
  assert.equal(product.sku, 'SP-API-1');
  assert.equal(product.backendId, 91);
  assert.equal(product.cat, 'panel');
  assert.equal(product.name, 'RTM300 300W');
  assert.equal(product.price, 25000);
  assert.equal(product.remote, true);
  assert.equal(product.img, API_PRODUCT.image);
  assert.deepEqual(product.gallery, [API_PRODUCT.image, ...API_PRODUCT.images]);
  assert.equal(product.datasheet, API_PRODUCT.datasheet);
  assert.deepEqual(product.specs.en, {
    Model: 'RTM300',
    Wattage: '300W',
    Voltage: '24V',
    Dimensions: '1650x990x35mm',
    Features: 'TOPCon, Bifacial',
    'Use cases': 'Homes, Shops',
  });
  assert.equal(Catalog.assetUrl(product, product.img), API_PRODUCT.image);
  assert.deepEqual(result.inventory, { 'SP-API-1': 4 });
});

test('API categories map onto the categories understood by existing cards', () => {
  const cases = {
    solar_panels: 'panel',
    batteries: 'battery',
    inverters: 'inverter',
    charge_controllers: 'controller',
    ess: 'ess',
    solar_lights: 'light',
    water_pumps: 'pump',
    solar_kits: 'kit',
  };
  for (const [category, expected] of Object.entries(cases)) {
    assert.equal(Catalog.mapCategory(category), expected, category);
  }
  assert.equal(Catalog.mapCategory('other', 'refrigerators'), 'fridge');
});

test('only Cameroon exposes XAF prices; every other country remains price-on-request', () => {
  assert.equal(Catalog.adaptCatalog([API_PRODUCT], 'CM').products[0].price, 25000);
  for (const country of ['ML', 'NG', 'SD']) {
    assert.equal(Catalog.adaptCatalog([API_PRODUCT], country).products[0].price, null, country);
  }

  const staticProduct = { id: 'SP-LOCAL', price: 60000, img: 'SP-LOCAL.jpg' };
  assert.equal(Catalog.fallbackCatalog([staticProduct], 'CM').products[0].price, 60000);
  assert.equal(Catalog.fallbackCatalog([staticProduct], 'NG').products[0].price, null);
  assert.equal(Catalog.assetUrl(staticProduct, staticProduct.img), 'assets/products/SP-LOCAL.jpg');
});

test('country-owned numeric stock is tracked while shared zero stock remains untracked', () => {
  const shared = { ...API_PRODUCT, id: 1, sku: 'SHARED-0', country: null, stock: 0 };
  const own = { ...API_PRODUCT, id: 2, sku: 'NG-0', country: 'NG', stock: 0 };
  const sharedTracked = { ...API_PRODUCT, id: 3, sku: 'SHARED-3', country: null, stock: 3 };
  const result = Catalog.adaptCatalog([shared, own, sharedTracked], 'NG');

  assert.equal(Object.hasOwn(result.inventory, 'SHARED-0'), false);
  assert.equal(result.inventory['NG-0'], 0);
  assert.equal(result.inventory['SHARED-3'], 3);
});

test('a successful empty response is authoritative and never replaced by static products', async () => {
  const loader = Catalog.createLoader({
    baseUrl: 'https://rest-solar-agent-cm.onrender.com',
    fallbackProducts: [{ id: 'STATIC-1', price: 1, img: 'STATIC-1.jpg' }],
    fetch: async () => ({ ok: true, json: async () => [] }),
  });

  const result = await loader.load('CM');
  assert.equal(result.source, 'remote');
  assert.deepEqual(result.products, []);
  assert.deepEqual(result.inventory, {});
});

test('network, non-2xx and malformed responses use the country-safe static fallback', async () => {
  const fallbacks = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 503, json: async () => [] }),
    async () => ({ ok: true, json: async () => ({ products: [] }) }),
  ];

  for (const fakeFetch of fallbacks) {
    const loader = Catalog.createLoader({
      baseUrl: 'https://rest-solar-agent-cm.onrender.com',
      fallbackProducts: [{ id: 'STATIC-1', price: 60000, img: 'STATIC-1.jpg' }],
      fetch: fakeFetch,
    });
    const result = await loader.load('ML');
    assert.equal(result.source, 'fallback');
    assert.equal(result.products[0].id, 'STATIC-1');
    assert.equal(result.products[0].price, null);
  }
});

test('a response becomes stale as soon as a newer country load starts', async () => {
  const pending = new Map();
  const loader = Catalog.createLoader({
    baseUrl: 'https://rest-solar-agent-cm.onrender.com',
    fallbackProducts: [],
    fetch: url => new Promise(resolve => pending.set(new URL(url).searchParams.get('country'), resolve)),
  });

  const cm = loader.load('CM');
  const ng = loader.load('NG');
  await Promise.resolve();
  pending.get('NG')({ ok: true, json: async () => [{ ...API_PRODUCT, sku: 'NG-1', country: 'NG' }] });
  const ngResult = await ng;
  pending.get('CM')({ ok: true, json: async () => [{ ...API_PRODUCT, sku: 'CM-1', country: 'CM' }] });
  const cmResult = await cm;

  assert.equal(ngResult.stale, false);
  assert.equal(ngResult.products[0].id, 'NG-1');
  assert.deepEqual(cmResult, { stale: true });
});

test('loader requests the selected country from the central product endpoint', async () => {
  let requested = null;
  const loader = Catalog.createLoader({
    baseUrl: 'https://rest-solar-agent-cm.onrender.com/',
    fallbackProducts: [],
    fetch: async url => {
      requested = url;
      return { ok: true, json: async () => [] };
    },
  });

  await loader.load('SD');
  assert.equal(requested, 'https://rest-solar-agent-cm.onrender.com/api/products?country=SD');
});
