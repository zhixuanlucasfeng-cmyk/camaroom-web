const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/* fill() lives inline in index.html, so it is extracted and evaluated here
 * rather than reimplemented — a copy in the test would have happily passed
 * while the shipped one was broken.
 */
function loadFill({ lang = 'en', country = 'CM' } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const start = html.indexOf('const COUNTRY_TOKENS = {');
  const end = html.indexOf('const t = (k, vars) =>', start);
  assert.ok(start !== -1 && end > start, 'could not find the token/fill block in index.html');
  const source = html.slice(start, end);
  const RSCountries = require('../assets/js/countries.js');
  // eslint-disable-next-line no-new-func
  return new Function('RSCountries', 'lang', 'COUNTRY',
    `${source}; return { fill };`)(RSCountries, lang, country);
}

test('a value that is not a string is returned untouched', () => {
  const { fill } = loadFill();
  // The real shape of a product's specs — this is what the bug destroyed.
  const specs = { Model: 'HH3', Capacity: '5.12kWh', Dimensions: '480x485x190mm' };
  assert.strictEqual(fill(specs), specs, 'an object must come back as the same object');
  assert.deepEqual(Object.entries(fill(specs)), Object.entries(specs));
  assert.strictEqual(fill(null), null);
  assert.strictEqual(fill(undefined), undefined);
  assert.strictEqual(fill(0), 0);
  assert.deepEqual(fill(['a', 'b']), ['a', 'b']);
});

test('a specs object never degrades into "[object Object]"', () => {
  const { fill } = loadFill();
  const rendered = Object.entries(fill({ Model: 'HH3', Capacity: '5.12kWh' }))
    .map(([k, v]) => `${k}=${v}`).join(',');
  assert.equal(rendered, 'Model=HH3,Capacity=5.12kWh');
  assert.ok(!rendered.includes('[object'), 'specs must not stringify');
});

test('strings still get their {country} token filled', () => {
  assert.equal(loadFill({ lang: 'en', country: 'CM' }).fill('Delivery across {country}'),
    'Delivery across Cameroon');
  assert.equal(loadFill({ lang: 'en', country: 'NG' }).fill('Delivery across {country}'),
    'Delivery across Nigeria');
  assert.equal(loadFill({ lang: 'ar', country: 'SD' }).fill('في {country}'), 'في السودان');
});

test('French keeps its contracted prepositions', () => {
  assert.equal(loadFill({ lang: 'fr', country: 'ML' }).fill('Livraison partout {inCountry}'),
    'Livraison partout au Mali');
  assert.equal(loadFill({ lang: 'fr', country: 'OTHER' }).fill('Livraison partout {inCountry}'),
    'Livraison partout en Afrique');
  assert.equal(loadFill({ lang: 'fr', country: 'CM' }).fill('entreprises {ofCountry}'),
    'entreprises du Cameroun');
});

test('explicit vars win over the current country, and unknown tokens are left alone', () => {
  const { fill } = loadFill({ lang: 'en', country: 'CM' });
  assert.equal(fill('Switching to {country} will empty your cart ({n} items).',
    { n: 3, country: 'Nigeria' }),
    'Switching to Nigeria will empty your cart (3 items).');
  assert.equal(fill('{unknown} stays'), '{unknown} stays');
});
