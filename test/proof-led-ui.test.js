const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function firstViewportMarkup(document) {
  const match = document.match(/<section[^>]*\bid="top"[^>]*>/);
  const start = match ? match.index : -1;
  const end = document.indexOf('</section>', start);
  assert.notEqual(start, -1, 'page must ship a primary first viewport');
  assert.notEqual(end, -1, 'primary first viewport must be complete');
  return document.slice(start, end + 10);
}

test('the first response presents a usable product record without autoplay media', () => {
  const firstViewport = firstViewportMarkup(html);

  assert.match(firstViewport, /id="proofRecord"/);
  assert.match(firstViewport, /href="#products"/);
  assert.match(firstViewport, /id="heroCountryRecord"/);
  assert.doesNotMatch(firstViewport, /<video|hero-bg\.mp4|id="heroMotes"/);
});

test('the initial document loads the proof-led visual system', () => {
  assert.match(html, /assets\/css\/restar-record\.css/);
});

test('the public page does not present unverified promotional media as proof', () => {
  assert.doesNotMatch(html, /hero-bg\.mp4|assets\/video\/poster\.jpg|assets\/farm\//);
  assert.doesNotMatch(html, /function cinema|heroMotes|moteFloat/);
});

test('unapproved synthetic hero files are not shipped', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'hero-bg.mp4')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'assets', 'video', 'poster.jpg')), false);
});

test('the first viewport offers all four primary equipment paths', () => {
  const firstViewport = firstViewportMarkup(html);
  for (const family of ['panel', 'battery', 'inverter', 'kit']) {
    assert.match(firstViewport, new RegExp(`data-family="${family}"`));
  }
});

test('the customer assistant uses the same restrained operational visual system', () => {
  const start = html.indexOf('<!-- AI Customer Service Widget -->');
  const end = html.indexOf('/* Boot:', start);
  const widget = html.slice(start, end);

  assert.match(widget, /class="rs-assistant"/);
  assert.match(widget, /class="rs-assistant__human"/);
  assert.match(widget, /!e\.isComposing/);
  assert.doesNotMatch(widget, /linear-gradient/);
});
