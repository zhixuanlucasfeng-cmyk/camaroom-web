const test = require('node:test');
const assert = require('node:assert');
const C = require('../assets/js/countries.js');

// resolveCountry's priority ladder: URL > stored > IP > OTHER.
async function resolve(opts) {
  return (await resolveFull(opts)).code;
}

function resolveFull(opts) {
  return C.resolveCountry({
    search: opts.search || '',
    storageGet: () => (opts.stored === undefined ? null : opts.stored),
    storageSet: opts.storageSet || (() => {}),
    geo: () => (opts.geo instanceof Error ? Promise.reject(opts.geo) : Promise.resolve(opts.geo ?? null)),
  });
}

test('URL parameter wins over everything else', async () => {
  assert.equal(await resolve({ search: '?country=ml', stored: 'CM', geo: 'NG' }), 'ML');
});

test('URL parameter is case-insensitive and is remembered', async () => {
  let saved = null;
  assert.equal(await resolve({ search: '?country=Ng', storageSet: (k, v) => { saved = v; } }), 'NG');
  assert.equal(saved, 'NG');
});

test('an unknown URL code is skipped, not honoured', async () => {
  assert.equal(await resolve({ search: '?country=zz', stored: 'SD' }), 'SD');
  assert.equal(await resolve({ search: '?country=zz', geo: 'ML' }), 'ML');
});

test('stored choice wins over IP', async () => {
  assert.equal(await resolve({ stored: 'SD', geo: 'CM' }), 'SD');
});

test('a corrupt stored value falls through to IP', async () => {
  assert.equal(await resolve({ stored: 'nonsense', geo: 'CM' }), 'CM');
});

test('IP result is used when there is no URL param or stored choice', async () => {
  assert.equal(await resolve({ geo: 'ML' }), 'ML');
});

test('a country we do not serve falls back to OTHER', async () => {
  assert.equal(await resolve({ geo: 'FR' }), 'OTHER');
});

test('no signal at all falls back to OTHER', async () => {
  assert.equal(await resolve({}), 'OTHER');
});

test('a failing or timed-out geo lookup falls back to OTHER, never throws', async () => {
  assert.equal(await resolve({ geo: new Error('network down') }), 'OTHER');
});

test('the resolution says where the country came from', async () => {
  assert.equal((await resolveFull({ search: '?country=ml' })).source, 'url');
  assert.equal((await resolveFull({ stored: 'SD' })).source, 'stored');
  assert.equal((await resolveFull({ geo: 'CM' })).source, 'geo');
  // Nothing at all is still a guess, not a choice the visitor made.
  assert.equal((await resolveFull({})).source, 'geo');
});

test('storage that throws on read is survivable', async () => {
  const result = await C.resolveCountry({
    search: '',
    storageGet: () => { throw new Error('blocked'); },
    storageSet: () => {},
    geo: () => Promise.resolve('CM'),
  });
  assert.equal(result.code, 'CM');
});

// Config-table integrity: these are the invariants the page relies on when it
// renders contacts and decides whether ordering is possible.
test('every country in ORDER exists, and vice versa', () => {
  assert.deepEqual([...C.ORDER].sort(), Object.keys(C.COUNTRIES).sort());
});

test('every country has a flag, a name, a default language and a contact', () => {
  for (const code of C.ORDER) {
    const c = C.COUNTRIES[code];
    assert.ok(c.flag, `${code} flag`);
    assert.ok(c.name, `${code} name`);
    assert.ok(['en', 'fr', 'ar'].includes(c.lang), `${code} lang is a language the site has`);
    assert.ok(c.contacts.length > 0, `${code} has at least one contact`);
  }
});

test('a country that can take online orders has a currency', () => {
  for (const code of C.ORDER) {
    const c = C.COUNTRIES[code];
    if (c.cart_backend) assert.ok(c.currency, `${code} sells online but has no currency`);
  }
});

test('config_contact and order_contact point at real contacts', () => {
  for (const code of C.ORDER) {
    const c = C.COUNTRIES[code];
    assert.ok(c.contacts[c.config_contact], `${code} config_contact out of range`);
    assert.ok(c.contacts[c.order_contact], `${code} order_contact out of range`);
  }
});

test('every phone number is digits only, so wa.me links cannot break', () => {
  for (const code of C.ORDER) {
    for (const contact of C.COUNTRIES[code].contacts) {
      assert.match(contact.phone, /^[0-9]{8,15}$/, `${code}/${contact.name} phone`);
      assert.ok(contact.phone_display, `${code}/${contact.name} display number`);
    }
  }
});
