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

// Cloudflare's /cdn-cgi/trace is how the country is read when the site is not
// hosted on Pages, so /api/geo does not exist to answer.
test('the Cloudflare trace parser reads the country and ignores the rest', () => {
  const trace = 'fl=123abc\nh=example.workers.dev\nip=2001:db8::1\nts=1758283200\ncolo=CDG\nloc=AE\ntls=TLSv1.3\n';
  assert.equal(C.parseTrace(trace), 'AE');
});

test('the trace parser returns null rather than guessing', () => {
  // No loc line at all (Cloudflare omits it for unknown/reserved addresses).
  assert.equal(C.parseTrace('colo=CDG\nip=2001:db8::1\n'), null);
  assert.equal(C.parseTrace(''), null);
  // "loc" must be the whole key, not a suffix of another one.
  assert.equal(C.parseTrace('xloc=ZZ\n'), null);
  // An HTML error page must never read as a country.
  assert.equal(C.parseTrace('<!DOCTYPE html><html><body>404</body></html>'), null);
});

test('a lowercase trace country still resolves to a served country', async () => {
  assert.equal(C.parseTrace('loc=ml\n'), 'ML');
  assert.equal(await resolve({ geo: C.parseTrace('loc=ml\n') }), 'ML');
});

// The synchronous rungs exist so the page can settle its country before the
// first render instead of painting one country and swapping to another.
test('the sync resolver answers for a URL parameter and a stored choice', () => {
  assert.deepEqual(
    C.resolveCountrySync({ search: '?country=ml', storageGet: () => null, storageSet: () => {} }),
    { code: 'ML', source: 'url' });
  assert.deepEqual(
    C.resolveCountrySync({ search: '', storageGet: () => 'SD', storageSet: () => {} }),
    { code: 'SD', source: 'stored' });
});

test('the sync resolver returns null when only an IP lookup could answer', () => {
  assert.equal(C.resolveCountrySync({ search: '', storageGet: () => null, storageSet: () => {} }), null);
  // Unrecognised values are skipped at both rungs, not treated as answers.
  assert.equal(C.resolveCountrySync({ search: '?country=zz', storageGet: () => 'nonsense', storageSet: () => {} }), null);
});

test('the sync resolver survives storage that throws', () => {
  assert.equal(
    C.resolveCountrySync({ search: '', storageGet: () => { throw new Error('blocked'); }, storageSet: () => {} }),
    null);
});

test('sync and async resolution agree wherever sync has an answer', async () => {
  for (const opts of [{ search: '?country=ng' }, { search: '', stored: 'CM' }]) {
    const deps = {
      search: opts.search || '',
      storageGet: () => opts.stored || null,
      storageSet: () => {},
      geo: () => Promise.resolve('ML'),   // must be ignored when sync answers
    };
    const sync = C.resolveCountrySync(deps);
    const async_ = await C.resolveCountry(deps);
    assert.deepEqual(async_, sync);
  }
});
