const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function firstViewportMarkup(document) {
  const match = document.match(/<section[^>]*\bid="top"[^>]*>/);
  const start = match ? match.index : -1;
  const end = document.indexOf('</section>', start);
  assert.notEqual(start, -1, 'page must ship a primary first viewport');
  assert.notEqual(end, -1, 'primary first viewport must be complete');
  return document.slice(start, end + 10);
}

test('the old hero video is shipped and enhanced for visitors who allow motion', () => {
  const firstViewport = firstViewportMarkup(html);

  assert.match(firstViewport, /<video[^>]*id="heroVideo"[^>]*autoplay[^>]*muted[^>]*loop[^>]*playsinline/);
  assert.match(firstViewport, /poster="assets\/video\/poster\.jpg"/);
  assert.match(firstViewport, /<source data-src="hero-bg\.mp4" type="video\/mp4">/);
  assert.match(firstViewport, /source\.parentNode\.load\(\)/);
  assert.equal(fs.existsSync(path.join(root, 'hero-bg.mp4')), true);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'video', 'poster.jpg')), true);
});

test('the original animated hero composition is restored', () => {
  const firstViewport = firstViewportMarkup(html);

  assert.match(firstViewport, /class="hero-sky"/);
  assert.match(firstViewport, /id="heroMotes"/);
  assert.match(firstViewport, /class="hero-grid"/);
  assert.match(firstViewport, /class="hero-trust"/);
  assert.doesNotMatch(firstViewport, /id="proofRecord"|data-family=/);
  assert.doesNotMatch(html, /assets\/css\/restar-record\.css/);
});

test('the original product catalogue layout remains wired to live products and cart actions', () => {
  assert.match(html, /<section class="section section--mist" id="products">/);
  assert.match(html, /<div class="filters" id="filters"><\/div>/);
  assert.match(html, /<div class="grid" id="grid"><\/div>/);
  assert.match(html, /class="card-photo"/);
  assert.match(html, /class="btn btn--ghost add-to-cart"/);
  assert.match(html, /window\.Cart\.add\(\{ sku:/);
  assert.match(html, /catalogLoader\.load\(servedCountry\)/);
  assert.match(html, /id="modal" role="dialog"/);
});

test('the customer assistant keeps composition-safe message sending', () => {
  assert.match(html, /!e\.isComposing/);
});
