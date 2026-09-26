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
