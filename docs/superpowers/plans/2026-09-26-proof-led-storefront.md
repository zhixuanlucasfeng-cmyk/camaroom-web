# Proof-Led Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace restarsolar.net's synthetic hero and template styling with a responsive proof-led equipment catalogue while preserving country, language, catalogue, cart, contact, and chat behavior.

**Architecture:** Keep the existing static HTML/vanilla-JavaScript deployment and behavioral IDs. Add one dedicated visual-system stylesheet, replace only the presentation markup that defines the first viewport, and reuse existing catalogue/country renderers. Remove the synthetic hero media from both markup and repository after tests prove it is no longer referenced.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node.js built-in test runner, Cloudflare Pages

**Spec:** `docs/superpowers/specs/2026-09-26-proof-led-redesign-design.md`

## Global Constraints

- Do not add a frontend framework or large component library.
- Do not add generated imagery, competitor imagery, invented proof, pricing, availability, customers, or claims.
- Preserve CM/ML/NG/SD/OTHER selection, English/French/Arabic, RTL, cart behavior, WhatsApp routing, chatbot, and human handoff.
- Keep the page usable at 360px and on slow mobile connections.
- Use only real product/document media with known repository provenance.

---

### Task 1: Lock the no-synthetic-media contract

**Files:**
- Create: `test/proof-led-ui.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: existing static `index.html`
- Produces: test helpers `readIndex()` and `assertNoSyntheticHero()` used only by this test file

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('first viewport uses the proof record and no synthetic hero media', () => {
  assert.match(html, /id="proofRecord"/);
  assert.match(html, /assets\/css\/restar-record\.css/);
  assert.doesNotMatch(html, /hero-bg\.mp4|assets\/video\/poster\.jpg|id="heroMotes"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/proof-led-ui.test.js`  
Expected: FAIL because `proofRecord` and the stylesheet do not exist and hero media is still referenced.

- [ ] **Step 3: Add the stylesheet link and replace the hero media container with `#proofRecord`**

The new first viewport keeps existing translation hooks and CTA targets, adds four family links to `#products`, and contains no `<video>` or decorative image.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/proof-led-ui.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html test/proof-led-ui.test.js
git commit -m "test: lock proof-led storefront contract"
```

### Task 2: Build the proof-led visual system

**Files:**
- Create: `assets/css/restar-record.css`
- Modify: `index.html`
- Test: `test/proof-led-ui.test.js`

**Interfaces:**
- Consumes: existing IDs and renderer output (`#offerGrid`, `#filters`, `#grid`, `#whyGrid`, `#certGrid`)
- Produces: CSS tokens and component rules for `.record-hero`, `.record-index`, `.record-proof`, product cards, documents, contact, footer, RTL, and responsive states

- [ ] **Step 1: Extend the test to require the visible country record and four product-family links**

Assert `#heroCountryRecord` exists and the first viewport contains anchors for `panel`, `battery`, `inverter`, and `kit`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test test/proof-led-ui.test.js`  
Expected: FAIL on the missing record elements.

- [ ] **Step 3: Implement the first viewport and global design tokens**

Use `#0B2E4F`, `#F3EFE6`, `#252B31`, and `#E86F1C`; remove gradient text, glass effects, motes, parallax styling, excessive pill shapes, and decorative hover lifts. Use thin rules, reference labels, tabular values, and short functional transitions.

- [ ] **Step 4: Restyle the catalogue, certificates, contact, modal, cart, and footer**

Keep all behavioral selectors and data attributes unchanged. Give products specification-record hierarchy, make “contact for price” visually explicit, and keep certificates documentary rather than decorative.

- [ ] **Step 5: Add responsive and RTL rules**

At `max-width: 820px`, collapse the record header to one column, keep country/language reachable, and prevent horizontal overflow. Mirror directional elements under `[dir="rtl"]`.

- [ ] **Step 6: Run the focused and existing storefront tests**

Run: `node --test test/*.test.js`  
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/css/restar-record.css index.html test/proof-led-ui.test.js
git commit -m "feat: redesign storefront around verified product records"
```

### Task 3: Remove unapproved hero assets and update sharing metadata

**Files:**
- Delete: `hero-bg.mp4`
- Delete: `assets/video/poster.jpg`
- Modify: `index.html`
- Test: `test/proof-led-ui.test.js`

**Interfaces:**
- Consumes: verified Restar logo at `logo.webp`
- Produces: metadata with no dependency on deleted raster/video assets

- [ ] **Step 1: Extend the test to verify no file reference to either asset remains**

Search `index.html`, `404.html`, and JavaScript sources for both filenames and require zero matches.

- [ ] **Step 2: Run the test and confirm failure if metadata still references the poster**

Run: `node --test test/proof-led-ui.test.js`.

- [ ] **Step 3: Replace Open Graph/Twitter image metadata with verified logo metadata or omit image tags**

Do not claim a wide social image when only the logo is available.

- [ ] **Step 4: Delete the two unapproved assets and run all tests**

Run: `node --test test/*.test.js`  
Expected: all tests PASS and repository search returns no references.

- [ ] **Step 5: Commit**

```bash
git add -A hero-bg.mp4 assets/video/poster.jpg index.html test/proof-led-ui.test.js
git commit -m "chore: remove synthetic storefront hero media"
```

### Task 4: Browser verification and design audit

**Files:**
- Create: `.impeccable/review/storefront-desktop.png`
- Create: `.impeccable/review/storefront-mobile.png`
- Modify only if verification finds a material defect: `assets/css/restar-record.css`, `index.html`

**Interfaces:**
- Consumes: finished storefront and existing country/catalogue scripts
- Produces: validated screenshots and detector report

- [ ] **Step 1: Serve the static site and inspect CM, ML, NG, SD, and OTHER**

Verify country label/contact/cart differences, all three languages, Arabic RTL, catalogue filters, modal, WhatsApp links, chat, and human handoff entry.

- [ ] **Step 2: Capture valid desktop and 360px mobile screenshots from the page top**

Confirm the files show loaded content with entrance motion disabled or settled.

- [ ] **Step 3: Run the Impeccable detector once**

Run: `/Users/lucasfeng/.agents/skills/impeccable/scripts/impeccable detect --json index.html assets/css/restar-record.css`.

- [ ] **Step 4: Fix mechanical findings, rerun tests, and commit**

```bash
git add index.html assets/css/restar-record.css .impeccable/review
git commit -m "fix: finish proof-led storefront responsive audit"
```

