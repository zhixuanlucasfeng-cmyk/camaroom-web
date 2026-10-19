const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const countries = require('../assets/js/countries.js');
const source = fs.readFileSync(require.resolve('../assets/js/site-shell.js'), 'utf8');

function boot(search = '', saved = null) {
  const floating = { setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; } };
  const context = { URL, URLSearchParams, location: { search }, window: {
    RSCountries: { ...countries, resolveCountrySync: () => ({code:'CM'}), storageGet: () => saved },
    RS_FRENCH: { Products: 'Produits' }
  }, document: {createElement: () => floating, body: {appendChild() {}}, querySelectorAll: () => [], querySelector: () => null} };
  vm.runInNewContext(source, context);
  return { site: context.window.RSSite, floating };
}

test('Cameroon defaults to French; explicit language overrides saved preference', () => {
  assert.equal(boot().site.language(), 'fr');
  assert.equal(boot('', 'en').site.language(), 'en');
  assert.equal(boot('?lang=fr', 'en').site.language(), 'fr');
  assert.equal(boot('?lang=invalid').site.language(), 'fr');
  assert.equal(boot().site.text('Products'), 'Produits');
});

test('floating WhatsApp follows each market without sending anything', () => {
  const {site, floating} = boot();
  for (const code of ['CM', 'ML', 'NG', 'SD']) {
    site.update(code, countries.COUNTRIES[code].lang);
    const contact = countries.COUNTRIES[code].contacts[countries.COUNTRIES[code].order_contact];
    assert.equal(new URL(floating.href).pathname, '/' + contact.phone);
    assert.ok(new URL(floating.href).searchParams.get('text'));
  }
  site.update('CM', 'fr');
  assert.match(new URL(floating.href).searchParams.get('text'), /Bonjour.*Cameroun/);
});
