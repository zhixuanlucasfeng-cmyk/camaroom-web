# Mali Sales-Rep Frontend Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Mali storefront actually use the sales-rep assignment backend (deployed 2026-07-24, five real reps seeded, but never called by any frontend) instead of hardcoding the shared Tom Yang (China) WhatsApp contact for every customer.

**Architecture:** On page load, if `window.CART_API_BASE` is set, the storefront calls `GET {CART_API_BASE}/api/sales-rep?session=<SESSION>&source=page_load` (already deployed, CORS-open). On success it overrides the two WhatsApp contact points (chat-order button, cart-checkout button) with the assigned rep's phone; on any failure it silently keeps the existing Tom Yang fallback — this call must never be able to break page load or checkout. The cart checkout POST additionally sends `session_id` so the order gets linked to the same rep assignment server-side (`orders.js` already supports this, unused today because the field was never sent).

**Tech Stack:** Vanilla JS (no bundler, no frontend test harness in this repo — inline `<script>` in `index.html` + `assets/js/cart.js`). Backend is unchanged (Cloudflare Worker + D1, already tested in `backend/test/rep_assignment.test.js`).

## Global Constraints

- Do not change any behavior for Cameroon (must keep using Luc Su via `AGENT_PHONE_2` when present) or for countries without a cart backend (Nigeria/Sudan today — `CART_API_BASE` is empty for them, so the new fetch must no-op there, same as today).
- Do not fabricate any contact info. The only two real numbers involved are: existing Tom Yang fallback (`8618707737002`) and whatever `/api/sales-rep` returns from the real, already-seeded `sales_reps` table — see `[[SP-137 safeguard]]` comments in `scripts/generate_country_site.py`.
- `camaroom-web/index.html` is the master template consumed by `scripts/generate_country_site.py`; `Mali-website/index.html` is a **separate sibling repo**, currently drifted from a fresh regeneration (missing an unrelated stock-badge feature — confirmed via diff on 2026-08-07). Do NOT regenerate Mali-website's `index.html` wholesale in this task — that would silently bundle the unrelated stock-badge feature. Hand-apply the same targeted edit to both files instead.
- `camaroom-web/assets/js/cart.js` and `Mali-website/assets/js/cart.js` are byte-identical today (confirmed via diff) — edit master, then copy verbatim to keep them identical.
- No JS test harness exists for `index.html`'s inline scripts or `cart.js` in this repo (only the backend has vitest). Verification for these tasks is manual: local static server + a real browser, per this repo's established (lack of) frontend-test pattern. Do not introduce a new JS test framework as part of this task — out of scope.

---

### Task 1: Update the master template (`camaroom-web/index.html`)

**Files:**
- Modify: `camaroom-web/index.html:1105` (the `CART_WHATSAPP_NUMBER` fallback line) and the block immediately after it.

**Interfaces:**
- Consumes: existing `SESSION` var (defined `camaroom-web/index.html:942`), existing `AGENT_PHONE` / `AGENT_PHONE_2` vars (`camaroom-web/index.html:1082-1083`), existing `window.CART_API_BASE` (`camaroom-web/index.html:1084`).
- Produces: `window.CART_SESSION_ID` (new global, string) — consumed by Task 4 (`cart.js`). `window.CART_WHATSAPP_NUMBER` (existing global, now dynamically updated) and `AGENT_PHONE` (existing local var, now dynamically updated) — consumed by the existing chat-order WhatsApp button at `camaroom-web/index.html:1125`.

- [ ] **Step 1: Read the current block for exact context**

Run: `sed -n '1082,1106p' /Users/lucasfeng/camaroom-web/index.html`

Confirm it still reads exactly:
```js
  var AGENT_PHONE = '8618707737002';   // Tom Yang (China)
  var AGENT_PHONE_2 = '237681105611'; // Luc Su (Cameroon)
  window.CART_API_BASE = 'https://camaroom-cart-backend.zhixuanlucasfeng.workers.dev';
  window.CART_CURRENCY = 'XAF';
  // Stock badges: fetch once CART_API_BASE exists, then re-render the grid
  // (INVENTORY/renderGrid are defined in the earlier <script> block — top-level
  // let/const and function declarations are shared across inline scripts on
  // the same page). Silently no-ops on failure — an unreachable inventory
  // endpoint should never block the storefront from showing products.
  if (window.CART_API_BASE) {
    fetch(window.CART_API_BASE + '/api/inventory')
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        rows.forEach(function (row) { INVENTORY[row.sku] = row.stock_qty; });
        if (typeof renderGrid === 'function') renderGrid();
      })
      .catch(function () {});
  }
  // Guarded: the country-site generator strips the AGENT_PHONE_2 declaration
  // above for countries without a local rep (see strip_local_contact_block()
  // in scripts/generate_country_site.py), which would otherwise leave this a
  // dangling reference and throw a ReferenceError that aborts this whole
  // script block (breaking the chat widget below it) on page load.
  window.CART_WHATSAPP_NUMBER = (typeof AGENT_PHONE_2 !== 'undefined' ? AGENT_PHONE_2 : '');
```

If it differs, stop and re-read this whole plan's line numbers against the live file before continuing.

- [ ] **Step 2: Replace the empty-string fallback and add the session-rep lookup**

Replace the final line of that block:
```js
  window.CART_WHATSAPP_NUMBER = (typeof AGENT_PHONE_2 !== 'undefined' ? AGENT_PHONE_2 : '');
```
with:
```js
  window.CART_SESSION_ID = SESSION;
  // Falls back to Tom Yang (real, shared contact — never a fabricated
  // number, see SP-137 in generate_country_site.py) instead of an empty
  // string, which previously produced a broken https://wa.me/?text=... link
  // for any country without a local rep.
  window.CART_WHATSAPP_NUMBER = (typeof AGENT_PHONE_2 !== 'undefined' ? AGENT_PHONE_2 : AGENT_PHONE);
  // Session-consistent sales-rep override: if this country has a live cart
  // backend with a real seeded rep pool (Mali today), replace the Tom Yang
  // fallback with the customer's actually-assigned local rep. No-ops (keeps
  // the fallback above) if CART_API_BASE is empty, the request fails, or the
  // backend has no active reps (e.g. Cameroon's rep pool is intentionally
  // empty — see schema.sql) — this must never be able to break page load.
  if (window.CART_API_BASE) {
    fetch(window.CART_API_BASE + '/api/sales-rep?session=' + encodeURIComponent(SESSION) + '&source=page_load')
      .then(function (res) { if (!res.ok) throw new Error('no_rep'); return res.json(); })
      .then(function (rep) {
        if (rep && rep.phone) {
          AGENT_PHONE = rep.phone;
          window.CART_WHATSAPP_NUMBER = rep.phone;
        }
      })
      .catch(function () {});
  }
```

- [ ] **Step 3: Sanity-check the file still parses**

Run: `node --check <(python3 -c "
import re
html = open('/Users/lucasfeng/camaroom-web/index.html').read()
scripts = re.findall(r'<script>(.*?)</script>', html, re.DOTALL)
print(scripts[-2])
")`

(This extracts the second-to-last inline `<script>` block — the chat-widget IIFE containing your edit — and runs it through Node's syntax checker without executing it. If `node --check` isn't available, open the file in a browser tab instead per Task 5 and confirm no console syntax error.)

Expected: no output, exit code 0 (valid syntax).

- [ ] **Step 4: Commit**

```bash
cd /Users/lucasfeng/camaroom-web
git add index.html
git commit -m "Wire session-based sales-rep lookup into WhatsApp contact points"
```

---

### Task 2: Keep `generate_country_site.py` in sync with the new fallback line

**Files:**
- Modify: `camaroom-web/scripts/generate_country_site.py:104-109` (the regex that used to strip the guard comment + line down to `window.CART_WHATSAPP_NUMBER = '';`).

**Interfaces:**
- Consumes: the exact new text produced by Task 1 Step 2 in `camaroom-web/index.html`.
- Produces: generated Nigeria/Sudan/future-country `index.html` output with `AGENT_PHONE_2` fully absent from the ternary (not just guarded), matching prior behavior for those countries.

- [ ] **Step 1: Update the regex target and replacement**

In `strip_local_contact_block()`, replace:
```python
    html = re.sub(
        r"\n  // Guarded:.*?\n  window\.CART_WHATSAPP_NUMBER = \(typeof AGENT_PHONE_2 !== 'undefined' \? AGENT_PHONE_2 : ''\);\n",
        "\n  window.CART_WHATSAPP_NUMBER = '';\n",
        html,
        flags=re.DOTALL,
    )
```
with:
```python
    html = re.sub(
        r"\n  // Guarded:.*?\n  window\.CART_WHATSAPP_NUMBER = \(typeof AGENT_PHONE_2 !== 'undefined' \? AGENT_PHONE_2 : AGENT_PHONE\);\n",
        "\n  window.CART_WHATSAPP_NUMBER = AGENT_PHONE;\n",
        html,
        flags=re.DOTALL,
    )
```

(The sales-rep lookup block added in Task 1 Step 2 is intentionally left alone — it only references `AGENT_PHONE`, `SESSION`, and `CART_API_BASE`, all of which stay defined for every country, so it needs no per-country stripping.)

- [ ] **Step 2: Regenerate Nigeria into a scratch dir and diff against the last known-good generation**

```bash
cd /Users/lucasfeng/camaroom-web
python3 scripts/generate_country_site.py --country nigeria --out /tmp/nigeria-regen-check
diff /tmp/nigeria-regen-check/index.html /Users/lucasfeng/Nigeria-website/index.html
```

Expected: the only diff hunks are (a) the `CART_WHATSAPP_NUMBER`/session-rep block from this task, plus (b) any already-known unrelated drift (e.g. missing stock-badge feature, same class of diff seen for Mali on 2026-08-07 — do not fix that drift here, it's out of scope). If you see `AGENT_PHONE_2` anywhere in `/tmp/nigeria-regen-check/index.html`, the regex did not match — stop and re-check Step 1's regex against the actual current file content before proceeding.

- [ ] **Step 3: Commit**

```bash
cd /Users/lucasfeng/camaroom-web
git add scripts/generate_country_site.py
git commit -m "Keep generator's AGENT_PHONE_2 stripping in sync with Tom Yang fallback change"
```

---

### Task 3: Hand-apply the same edit to `Mali-website/index.html`

**Files:**
- Modify: `Mali-website/index.html:1055-1058`.

**Interfaces:**
- Consumes: `SESSION` (already defined earlier in the same IIFE at `Mali-website/index.html:915`), `AGENT_PHONE` (`Mali-website/index.html:1055`), `window.CART_API_BASE` (`Mali-website/index.html:1056`).
- Produces: same `window.CART_SESSION_ID` / dynamic `window.CART_WHATSAPP_NUMBER` / `AGENT_PHONE` behavior as Task 1, scoped to Mali's own IIFE.

- [ ] **Step 1: Read the current block for exact context**

Run: `sed -n '1055,1059p' /Users/lucasfeng/Mali-website/index.html`

Confirm it reads exactly:
```js
  var AGENT_PHONE = '8618707737002';   // Tom Yang (China) — shared contact until a local rep is confirmed
  window.CART_API_BASE = 'https://camaroom-cart-backend-mali.zhixuanlucasfeng.workers.dev';
  window.CART_CURRENCY = 'XOF';
  window.CART_WHATSAPP_NUMBER = '';
```

Note: Mali-website's file predates the stock-badge feature and the `AGENT_PHONE_2` guard-comment pattern, so its block is simpler than the master's — there is no `AGENT_PHONE_2` here at all (this site never had a local-contact block to begin with), so no ternary is needed.

- [ ] **Step 2: Replace the last line with the session-rep wiring**

Replace:
```js
  window.CART_WHATSAPP_NUMBER = '';
```
with:
```js
  window.CART_SESSION_ID = SESSION;
  window.CART_WHATSAPP_NUMBER = AGENT_PHONE;
  // Session-consistent sales-rep override: Mali has a live cart backend
  // with a real seeded rep pool (5 reps, seeded 2026-07-24) — replace the
  // Tom Yang fallback with the customer's actually-assigned local rep.
  // No-ops (keeps the Tom Yang fallback above) on any failure, including
  // no_active_reps — this must never be able to break page load.
  if (window.CART_API_BASE) {
    fetch(window.CART_API_BASE + '/api/sales-rep?session=' + encodeURIComponent(SESSION) + '&source=page_load')
      .then(function (res) { if (!res.ok) throw new Error('no_rep'); return res.json(); })
      .then(function (rep) {
        if (rep && rep.phone) {
          AGENT_PHONE = rep.phone;
          window.CART_WHATSAPP_NUMBER = rep.phone;
        }
      })
      .catch(function () {});
  }
```

- [ ] **Step 3: Diff against the master edit to confirm they match in substance**

```bash
diff <(sed -n '1082,1130p' /Users/lucasfeng/camaroom-web/index.html) <(sed -n '1055,1099p' /Users/lucasfeng/Mali-website/index.html)
```

Expected: differences limited to (a) the Cameroon-only `AGENT_PHONE_2`/stock-badge lines master has and Mali doesn't, (b) the `CART_API_BASE`/`CART_CURRENCY` literal values, (c) line-number shift. The sales-rep fetch block body itself should read identically between the two files.

- [ ] **Step 4: Commit**

```bash
cd /Users/lucasfeng/Mali-website
git add index.html
git commit -m "Wire session-based sales-rep lookup into WhatsApp contact points"
```

---

### Task 4: Send `session_id` from the cart checkout flow

**Files:**
- Modify: `camaroom-web/assets/js/cart.js:101-106` (the `submitOrder(...)` call inside `renderContactForm`).
- Modify (copy): `Mali-website/assets/js/cart.js` (kept byte-identical to master today — confirmed via diff on 2026-08-07).

**Interfaces:**
- Consumes: `window.CART_SESSION_ID`, produced by Task 1/Task 3.
- Produces: `session_id` field on the `POST {CART_API_BASE}/api/orders` request body — consumed server-side by `backend/src/orders.js:40-47` (`handleCreateOrder` → `linkOrderToAssignment`, already implemented and tested, currently dead code because no caller ever sent this field).

- [ ] **Step 1: Edit `camaroom-web/assets/js/cart.js`**

Replace:
```js
      submitOrder({
        customer_name: document.getElementById('cart-name').value,
        customer_phone: document.getElementById('cart-phone').value,
        currency: window.CART_CURRENCY || 'XAF',
        items: items,
      });
```
with:
```js
      submitOrder({
        customer_name: document.getElementById('cart-name').value,
        customer_phone: document.getElementById('cart-phone').value,
        currency: window.CART_CURRENCY || 'XAF',
        items: items,
        session_id: window.CART_SESSION_ID || undefined,
      });
```

(`orders.js`'s `handleCreateOrder` only attempts the rep-link `if (body.session_id)` — sending `undefined` here means `JSON.stringify` omits the key entirely for any page where `CART_SESSION_ID` isn't set yet, which is a safe no-op identical to today's behavior.)

- [ ] **Step 2: Copy the updated file to the Mali sibling repo**

```bash
cp /Users/lucasfeng/camaroom-web/assets/js/cart.js /Users/lucasfeng/Mali-website/assets/js/cart.js
diff /Users/lucasfeng/camaroom-web/assets/js/cart.js /Users/lucasfeng/Mali-website/assets/js/cart.js
```

Expected: diff produces no output (files identical).

- [ ] **Step 3: Commit both repos**

```bash
cd /Users/lucasfeng/camaroom-web
git add assets/js/cart.js
git commit -m "Send session_id with cart orders so they link to the assigned sales rep"

cd /Users/lucasfeng/Mali-website
git add assets/js/cart.js
git commit -m "Send session_id with cart orders so they link to the assigned sales rep"
```

---

### Task 5: Manual browser verification against the live Mali backend

**Files:** none (verification only — no test harness exists for this code, see Global Constraints).

**Interfaces:**
- Consumes: the real deployed Mali Worker at `https://camaroom-cart-backend-mali.zhixuanlucasfeng.workers.dev` (already live, already has 5 active reps seeded — confirmed 2026-07-24).

- [ ] **Step 1: Serve Mali-website locally**

```bash
cd /Users/lucasfeng/Mali-website
python3 -m http.server 8899
```

- [ ] **Step 2: Load the page in a real browser and capture the assigned rep**

Open `http://127.0.0.1:8899/index.html`. In devtools Network tab, confirm a `GET .../api/sales-rep?session=rs-...&source=page_load` request fires on load and returns 200 with a JSON body containing `name` and `phone` from the seeded Mali rep pool (not Tom Yang's `8618707737002`).

- [ ] **Step 3: Confirm the chat-order WhatsApp button uses the assigned rep**

Trigger the chat widget's `WHATSAPP_ORDER::` flow (or inspect `AGENT_PHONE` in devtools console: `AGENT_PHONE` should equal the rep's phone from Step 2, not `8618707737002`, once the fetch has resolved).

- [ ] **Step 4: Confirm the cart-checkout WhatsApp link and session linkage**

Add a product to cart, submit the contact form, and confirm the resulting `wa.me/<number>` link uses the same assigned rep's phone. Then check the order landed in the same rep's assignment: `curl -s 'https://camaroom-cart-backend-mali.zhixuanlucasfeng.workers.dev/api/sales-rep?session=<the SESSION value from devtools console>&source=order'` and confirm the returned `order_id` matches the order just created (visible in the network tab's `/api/orders` response).

- [ ] **Step 5: Confirm the no-op path for a country without a rep pool**

Temporarily set `window.CART_API_BASE = ''` in devtools console and reload, or inspect `Nigeria-website/index.html` locally the same way — confirm no `/api/sales-rep` request fires and the WhatsApp button still falls back to Tom Yang, matching pre-change behavior.

- [ ] **Step 6: Stop the local server**

```bash
# Ctrl-C the python3 -m http.server process from Step 1
```

---

## Self-Review Notes

- **Spec coverage:** Task 1+3 cover "wire the deployed sales-rep backend into the Mali frontend" (both master template and the live sibling repo). Task 2 keeps the generator from regressing Nigeria/Sudan. Task 4 fixes the previously-dead `session_id` linkage so `orders.js`'s existing `linkOrderToAssignment` call actually fires. Task 5 verifies against the real live backend since there's no test harness for this code.
- **Placeholder scan:** no TBD/TODO placeholders; every step shows the literal code to write.
- **Type/name consistency:** `window.CART_SESSION_ID`, `window.CART_WHATSAPP_NUMBER`, `AGENT_PHONE`, `session_id` are spelled identically across all four tasks.
