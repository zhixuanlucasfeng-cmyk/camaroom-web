# Full product catalog + RESTAR warranty info

## Context

Two related additions, designed together because they touch the same data
pipeline and the same product-card UI:

1. `rest-solar-agent` (the AI chatbot) already has a full 2026 catalog of 169
   products (panels, batteries, inverters, ESS, charge controllers, and
   misc/other) ingested into its database, with specs, photos, and PDF
   datasheets. `camaroom-web` (the public site) does not — its `#products`
   section still shows the older, hand-curated 77-item list with no specs
   beyond a couple of key numbers.
2. Separately, RESTAR (the panel manufacturer) has an official warranty
   policy (effective 2026-01-01, two warranty types — product defects and
   linear power output — varying by panel family) that needs to appear (a) on
   the website's product cards and a new Warranty page, and (b) in the AI
   assistant's knowledge so it can answer warranty questions accurately.

Both are driven by the same source data
(`rest-solar-agent/data/catalog_2026/products.json`) and land in the same
place (`camaroom-web`'s `PRODUCTS` array), so they're built as one pipeline
rather than two.

## Scope

In scope:
- A one-time, rerunnable Python script,
  `camaroom-web/scripts/build_products.py`, that reads
  `rest-solar-agent/data/catalog_2026/products.json` and generates
  `camaroom-web/assets/data/products.js` — a static file in the exact shape
  of the existing `PRODUCTS` array (`id, cat, img, gallery, name, price,
  desc:{en,fr}, specs:{en,fr}`, plus a new `warranty` object on panel
  entries).
- Copying/renaming the 169 product photos from
  `rest-solar-agent/static/product_images/` into `camaroom-web/assets/products/`.
- Replacing the existing 77-item `PRODUCTS` array in `index.html` with a
  `<script src="assets/data/products.js">` include — the 77 old entries are
  retired, not merged/deduped.
- All 169 products get AI-translated (by me, matching the site's existing
  tone) French names/descriptions/spec labels — the source catalog is
  English-only.
- A `warranty` field on the 99 `solar_panels` entries only (batteries,
  inverters, ESS, charge controllers, and "other" get no warranty field).
- A short warranty line appended to each panel's `desc` (EN/FR).
- A new in-page `#warranty` section on `index.html` (nav + mobile nav +
  footer links added), same visual pattern as the existing `#certs`
  section: the two warranty types, a plain-language coverage table,
  plain-language exclusions, and the claims process (WhatsApp first).
- Warranty knowledge (family table, exclusions, claims process) added to
  `rest-solar-agent`'s orchestrator as a new guardrail rule, alongside the
  existing 5 (`no_invented_prices`, `cameroon_vat`, etc.), using the same
  keyword/tag-matching approach already in place — no new dependencies.
- Two new FAQ seed entries (`data/seeds/faqs_en.txt` / `faqs_fr.txt`) in
  `rest-solar-agent` covering warranty basics.

Out of scope (explicitly deferred):
- PDF datasheet downloads on the public site (291MB total; decided against
  to avoid repeating the repo-bloat problem already hit and declined-to-fix
  in `rest-solar-agent`). Product cards show full specs but no datasheet
  link. "Contact us" (WhatsApp) is the fallback for anyone who wants the PDF.
- Warranty info for anything other than solar panels (batteries/inverters/
  etc. — the source warranty document is PV-module-specific).
- Any redesign of `index.html`'s existing sections (hero, offer, why, about,
  contact) or its rendering/filter/modal JS — the existing `renderGrid`/
  `renderFilters`/modal code already handles arbitrary categories dynamically
  and needs zero changes.
- Migrating `camaroom-web`'s asset hosting off git (still plain files in the
  repo, same as today).

## Data pipeline

`scripts/build_products.py` (in `camaroom-web`, reads across into the
sibling `rest-solar-agent` checkout — path configurable, not hardcoded to
one machine):

1. Load `products.json`, keep only the 169 catalog entries.
2. **Category mapping** (source `category` → site `cat`):

   | source | site `cat` | note |
   |---|---|---|
   | `solar_panels` (99) | `panel` | |
   | `batteries` (26) | `battery` | |
   | `inverters` (19) | `inverter` | |
   | `ess` (6) | `ess` | |
   | `charge_controllers` (6) | `controller` | |
   | `other` (13) | `pump`/`fridge`/`light`/`fan` | keyword-classified from title: pump/water→`pump`, freezer/fridge→`fridge`, street light→`light`, fan→`fan` |

3. **Warranty derivation** (panels only), by matching the `model` field
   (case-insensitive prefix match) against RESTAR's official family table
   (source: "RESTAR Limited Manufacturer's Warranty for Crystalline Solar
   Photovoltaic Modules", effective 2026-01-01):

   | Family | Model prefixes | Product warranty | Performance warranty | Guaranteed output |
   |---|---|---|---|---|
   | Cutting-cell | `RTM-xxxP`, `RTM-xxxM` | 10 yr | 20 yr | ≥80.7% @ yr 20 |
   | Full-cell | `RT6S/C/D/F/E/G` (`-P`/`-M`) | 12 yr | 25 yr | ≥80.7% @ yr 25 |
   | Half-cell & full black | `RT7K/I`, `RT8V/K/I` (incl. `-FB`), `RT9Y/N/T/K/H` | 15 yr | 30 yr | ≥83.0% @ yr 30 |
   | Bifacial (`-BD`/`-DG` suffix) | any of the above with `-BD`/`-DG` | 15 yr | 30 yr | ≥84.95% @ yr 30 |

   17 of the 99 panel SKUs use model letters not in the source table
   (`RT8H`, `RT8L`, `RT8S`, `RT8X`, `RT7V`). Per user decision (2026-07-15):
   these are treated as the same "half-cell & full black" family (15yr/30yr,
   ≥83% @ yr 30) since they're the same generation as the documented RT7/RT8
   models, but each such entry gets an internal `warrantyAssumed: true` flag
   in the generated data (not shown to customers) so these 17 can be
   corrected later without re-deriving the rest.
   One entry (`中文RT8I-M-DG TOPCON 560-585W...`) has a text-extraction bug —
   Chinese text prepended to the model field. The build script strips
   non-ASCII prefixes before matching, so this one correctly resolves to the
   documented `RT8I-M-DG` family (no assumption needed).

   Resulting `warranty` object shape:
   ```json
   { "productYears": 15, "performanceYears": 30, "outputGuarantee": {"en": "≥83% output at year 30", "fr": "≥83 % de rendement à l'année 30"}, "assumed": true }
   ```

4. **Images**: for each product, copy `rest-solar-agent/static/product_images/{SKU}.jpg`
   into `camaroom-web/assets/products/{SKU}.jpg`. `img` field points here;
   `gallery` is a single-element array (only one extracted photo exists per
   product, unlike the old hand-curated entries which had multiple).
5. **`desc`**: short, category-level template text (not 169 unique
   paragraphs — matches the existing site's style, which already reuses one
   description across wattage variants of the same product line). Panel
   entries get the warranty line appended, e.g. EN `"...· 15-year product
   warranty · 30-year performance warranty (≥83% output guaranteed)"`.
6. **`specs`**: curated subset of the richest fields per category (panels:
   wattage, dimensions, efficiency/features; batteries: capacity, voltage,
   dimensions; inverters: power, voltage, features), with FR spec **labels**
   translated (values like `"550W"` stay as-is).
7. **`price`**: `0` for all 169 (renders as "contact for price", matching
   the existing pattern and the chatbot's `no_invented_prices` rule).

Output: `assets/data/products.js` (`const PRODUCTS = [...]`), committed as a
static generated file — the script is rerunnable but not part of any live
build/deploy step (GitHub Pages serves static files as-is).

## Website changes

- `index.html`: swap the inline 77-item `PRODUCTS` array for
  `<script src="assets/data/products.js"></script>` loaded before the
  existing inline `<script>` block. No changes to `renderGrid`,
  `renderFilters`, or the product modal — they already handle arbitrary
  `cat` values dynamically via `catLabel()`, which already has entries for
  every category this pipeline produces.
- New `#warranty` section, positioned after `#certs`, before `#about`
  (trust-building content grouped together). Content: two warranty types
  explained in plain language, the coverage table above (customer-facing
  version — no `assumed` flag shown), a plain-language exclusions list
  (improper install, unauthorized repairs, altered serial numbers, marine/
  mobile mounts, storm/lightning/flood damage, cosmetic-only issues,
  external glass breakage), the claims process (contact Rest Solar via
  WhatsApp with serial number + evidence, RESTAR must be notified within 3
  months), and the line "Panels sold by Rest Solar are covered by the
  official RESTAR manufacturer's warranty (effective Jan 1, 2026)." Added to
  desktop nav, mobile nav, and footer, matching the existing anchor-link
  pattern.
- New `I18N` keys for the above (`warranty.*`), EN and FR, following the
  existing dictionary's structure.

## AI assistant changes (rest-solar-agent)

- Warranty family table + exclusions + claims process added as structured
  data the orchestrator's existing keyword/tag-matching retrieval can look
  up by SKU/model — same approach already used for product specs (see
  `DONE_SUMMARY.md` §4: no embeddings, no new dependencies, plain SQLAlchemy
  + keyword scoring).
- New guardrail rule (6th, alongside the existing 5): never state warranty
  terms beyond what's in the family table; if the model can't be identified,
  give the general range (10–15yr product / 20–30yr performance) and ask for
  the model number on the panel label; always mention the 3-month claim
  window and WhatsApp-first claims process when a claim scenario comes up;
  answer in the customer's language (EN/FR).
- Two new FAQ seed entries in `faqs_en.txt` / `faqs_fr.txt` covering "what's
  the warranty" and "my panel is broken, what do I do" at a general level
  (the per-model lookup handles specific model questions; the FAQ entries
  are the fallback for generic questions).

## Files changed/added

```
camaroom-web:
  New:      scripts/build_products.py
            assets/data/products.js
            assets/products/*.jpg (169 files)
  Modified: index.html (script include replaces inline PRODUCTS array,
            #warranty section + nav links, I18N warranty.* keys)

rest-solar-agent:
  Modified: app/agent/orchestrator.py (warranty guardrail + lookup)
            data/seeds/faqs_en.txt, data/seeds/faqs_fr.txt
```

## Verification

- `rest-solar-agent`: full `pytest` suite stays green (64/64, no
  regressions).
- `camaroom-web`: manual browser check — one panel product card shows the
  warranty line correctly in both EN and FR (language toggle), the
  `#warranty` section renders and is reachable from nav/footer, and the
  product grid/filters still work with the new 169-item data (spot-check a
  few non-panel categories too, since those have no warranty field).
- Three sample chatbot Q&As, live against the running server: an RT9-panel
  warranty question, a "my panel broke" claims question, and one in French —
  matching the request's original ask.

## Open items / known limitations

1. The 17 `assumed: true` panel SKUs (RT8H/L/S/X, RT7V) use inferred
   warranty terms pending confirmation of the real figures from RESTAR.
2. No datasheet PDFs on the public site (see Scope). If this changes later,
   revisit the same repo-size tradeoff already documented in
   `rest-solar-agent/DONE_SUMMARY.md`.
3. The old 77-product images/data are retired from `index.html` but not
   deleted from the repo (`factory.html`/`gallery.html`'s "Products" photo
   category in the general gallery is untouched by this change — that's a
   separate, simpler photo grid, not the specs-driven `#products` catalogue).
