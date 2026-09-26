const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('products page renders the local catalogue while preserving official product categories', () => {
  const html = read('products.html');
  for (const category of ['Solar Panel', 'Solar Battery', 'Solar Inverter', 'ESS', 'Solar Charge Controller', 'Other Solar Products']) {
    assert.match(html, new RegExp(category));
  }
  assert.match(html, /assets\/data\/products\.js/);
  assert.match(html, /id="product-grid"/);
});

test('official social links are available without fake accounts', () => {
  const html = read('contact.html');
  assert.match(html, /facebook\.com\/profile\.php\?id=100091151491190/);
  assert.match(html, /instagram\.com\/restarsolar_/);
  assert.match(html, /mailto:sales@restarsolar\.com/);
});
