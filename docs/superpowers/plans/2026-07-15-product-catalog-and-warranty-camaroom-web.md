# Product Catalog + Warranty (camaroom-web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the site's 77-item hand-curated product list with the full 169-item 2026 catalog (already live in the `rest-solar-agent` chatbot), including RESTAR panel warranty info on cards and a new Warranty page section.

**Architecture:** A one-time, rerunnable Python build script reads `rest-solar-agent/data/catalog_2026/products.json` (the authoritative source, already verified against the live DB) and generates a static `assets/data/products.js` in the exact shape `index.html`'s existing `PRODUCTS` array already uses — so the existing `renderGrid`/`renderFilters`/modal JavaScript needs zero changes. Panel warranty terms are derived from a hardcoded family table (RESTAR's official policy) keyed by model prefix.

**Tech Stack:** Python 3 (stdlib only — `json`, `re`, `pathlib`, `shutil`, `argparse`; no new dependencies), static HTML/JS (no build tooling, no test framework — this is a GitHub Pages static site).

## Global Constraints

- Source of truth for product data: `/Users/lucasfeng/rest-solar-agent/data/catalog_2026/products.json` (169 entries). Read-only — this plan never modifies `rest-solar-agent`.
- No PDF datasheet downloads on the public site (291MB; explicitly deferred per the design spec's repo-size tradeoff).
- Warranty fields apply ONLY to `category == "solar_panels"` entries (99 of 169). All other categories get no `warranty` field.
- The existing 77-item `PRODUCTS` array in `index.html` is fully replaced, not merged/deduped.
- Existing `renderGrid`, `renderFilters`, `openModal`, `catLabel`, `CAT_COLOR`, `ICON` functions in `index.html` are NOT modified — the generated data must conform to their existing expectations.
- Exact warranty family table (from RESTAR's official policy, effective 2026-01-01):

  | Family | Product years | Performance years | Output guarantee |
  |---|---|---|---|
  | cutting_cell | 10 | 20 | ≥80.7% |
  | full_cell | 12 | 25 | ≥80.7% |
  | half_cell | 15 | 30 | ≥83% |
  | bifacial | 15 | 30 | ≥84.95% |

- 16 panel SKUs (model prefixes RT7V, RT8H, RT8L, RT8S, RT8X) are not in RESTAR's official family table; per user decision (2026-07-15) they are classified as `half_cell` (same generation as documented RT7/RT8 models) with an internal `assumed: true` flag — this flag is never shown to customers, only present in the generated data for future correction.

---

### Task 1: Warranty family classifier

**Files:**
- Create: `scripts/warranty_classifier.py`
- Test: `scripts/test_warranty_classifier.py`

**Interfaces:**
- Produces: `classify_panel_warranty(model: str) -> dict | None` — returns `{"product_years": int, "performance_years": int, "output_pct_en": str, "output_pct_fr": str, "assumed": bool}` or `None` if the model doesn't look like a panel at all (used by Task 2 to build the `warranty` field).

- [ ] **Step 1: Write the failing test**

Create `scripts/test_warranty_classifier.py`:

```python
"""
Standalone test (no pytest — this repo has no test framework/dependencies).
Run: python3 scripts/test_warranty_classifier.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from warranty_classifier import classify_panel_warranty

CATALOG_JSON = Path("/Users/lucasfeng/rest-solar-agent/data/catalog_2026/products.json")


def test_cutting_cell():
    r = classify_panel_warranty("RTM123P")
    assert r == {"product_years": 10, "performance_years": 20, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %", "assumed": False}, r


def test_full_cell():
    r = classify_panel_warranty("RT6S-M")
    assert r == {"product_years": 12, "performance_years": 25, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %", "assumed": False}, r


def test_half_cell_documented():
    r = classify_panel_warranty("RT8K-M")
    assert r == {"product_years": 15, "performance_years": 30, "output_pct_en": "≥83%", "output_pct_fr": "≥83 %", "assumed": False}, r


def test_half_cell_assumed():
    r = classify_panel_warranty("RT8H-M")
    assert r["assumed"] is True
    assert r["product_years"] == 15 and r["performance_years"] == 30


def test_bifacial_bd_suffix():
    r = classify_panel_warranty("RT8H-M-BD")
    assert r == {"product_years": 15, "performance_years": 30, "output_pct_en": "≥84.95%", "output_pct_fr": "≥84,95 %", "assumed": True}, r


def test_bifacial_dg_suffix_documented():
    r = classify_panel_warranty("RT8I-M-DG")
    assert r["output_pct_en"] == "≥84.95%"
    assert r["assumed"] is False


def test_garbled_prefix_bug():
    r = classify_panel_warranty("中文RT8I-M-DG TOPCON 560-585W 2278x1134x30mm")
    assert r is not None
    assert r["assumed"] is False
    assert r["output_pct_en"] == "≥84.95%"


def test_none_model():
    assert classify_panel_warranty(None) is None
    assert classify_panel_warranty("") is None


def test_unrelated_model_returns_none():
    assert classify_panel_warranty("HH3.6KS") is None


def test_all_99_real_panels_classify():
    data = json.loads(CATALOG_JSON.read_text())
    panels = [p for p in data if p["category"] == "solar_panels"]
    assert len(panels) == 99, f"expected 99 panels in source data, found {len(panels)}"
    unmatched = [p["sku"] for p in panels if classify_panel_warranty(p.get("model")) is None]
    assert unmatched == [], f"panels with no warranty classification: {unmatched}"
    assumed = [p["sku"] for p in panels if classify_panel_warranty(p.get("model"))["assumed"]]
    assert len(assumed) == 16, f"expected 16 assumed-family panels, found {len(assumed)}: {assumed}"


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
    if failed:
        print(f"\n{failed}/{len(tests)} tests failed")
        sys.exit(1)
    print(f"\nAll {len(tests)} tests passed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/test_warranty_classifier.py`
Expected: `ModuleNotFoundError: No module named 'warranty_classifier'` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `scripts/warranty_classifier.py`:

```python
"""
Classifies a RESTAR solar panel model number into its official warranty
family, per "RESTAR Limited Manufacturer's Warranty for Crystalline Solar
Photovoltaic Modules" (effective 2026-01-01).

16 real catalog SKUs use model prefixes (RT7V, RT8H, RT8L, RT8S, RT8X) not
listed in RESTAR's official family table. Per user decision (2026-07-15),
these are treated as the same generation/family as the documented RT7/RT8
half-cell models (same 15yr/30yr/83% terms) but flagged `assumed: True` so
they can be corrected later without re-deriving the rest of the catalog.
"""
import re

WARRANTY_FAMILIES = {
    "cutting_cell": {"product_years": 10, "performance_years": 20, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %"},
    "full_cell":    {"product_years": 12, "performance_years": 25, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %"},
    "half_cell":    {"product_years": 15, "performance_years": 30, "output_pct_en": "≥83%",   "output_pct_fr": "≥83 %"},
    "bifacial":     {"product_years": 15, "performance_years": 30, "output_pct_en": "≥84.95%", "output_pct_fr": "≥84,95 %"},
}

_FULL_CELL_PREFIXES = ("RT6S", "RT6C", "RT6D", "RT6F", "RT6E", "RT6G")
_HALF_CELL_PREFIXES = ("RT7K", "RT7I", "RT7V", "RT8V", "RT8K", "RT8I", "RT8H", "RT8L", "RT8S", "RT8X", "RT9Y", "RT9N", "RT9T", "RT9K", "RT9H")
_HALF_CELL_ASSUMED = ("RT7V", "RT8H", "RT8L", "RT8S", "RT8X")

_MODEL_RE = re.compile(r"RT[A-Z0-9-]+")


def classify_panel_warranty(model: str | None) -> dict | None:
    """Return the warranty dict for a panel model, or None if unrecognized."""
    if not model:
        return None
    upper = model.upper()
    match = _MODEL_RE.search(upper)
    if not match:
        return None
    m = match.group(0)

    if m.startswith("RTM"):
        family = "cutting_cell"
    elif m.startswith(_FULL_CELL_PREFIXES):
        family = "full_cell"
    elif m.startswith(_HALF_CELL_PREFIXES):
        family = "bifacial" if ("-BD" in m or "-DG" in m) else "half_cell"
    else:
        return None

    result = dict(WARRANTY_FAMILIES[family])
    result["assumed"] = any(m.startswith(p) for p in _HALF_CELL_ASSUMED)
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/test_warranty_classifier.py`
Expected: `All 10 tests passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/warranty_classifier.py scripts/test_warranty_classifier.py
git commit -m "Add RESTAR panel warranty family classifier"
```

---

### Task 2: Product data build script

**Files:**
- Create: `scripts/build_products.py`
- Test: `scripts/test_build_products.py`

**Interfaces:**
- Consumes: `classify_panel_warranty(model: str) -> dict | None` from Task 1 (`scripts/warranty_classifier.py`).
- Produces: `build_product_entry(raw: dict) -> dict` — converts one `products.json` record into the site's `PRODUCTS` entry shape: `{"id": str, "cat": str, "img": str, "gallery": [str], "name": str, "price": 0, "desc": {"en": str, "fr": str}, "specs": {"en": {...}, "fr": {...}}, "warranty": dict|None}`. Consumed by the CLI's `main()` and by later manual verification (Task 4).

- [ ] **Step 1: Write the failing test**

Create `scripts/test_build_products.py`:

```python
"""
Run: python3 scripts/test_build_products.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_products import build_product_entry, classify_other, CATEGORY_MAP


def test_category_map_covers_all_source_categories():
    assert CATEGORY_MAP["solar_panels"] == "panel"
    assert CATEGORY_MAP["batteries"] == "battery"
    assert CATEGORY_MAP["inverters"] == "inverter"
    assert CATEGORY_MAP["ess"] == "ess"
    assert CATEGORY_MAP["charge_controllers"] == "controller"


def test_classify_other_pump():
    assert classify_other("DC water pump") == "pump"


def test_classify_other_fridge():
    assert classify_other("Freezer Refrigerator(2)") == "fridge"


def test_classify_other_light_and_led():
    assert classify_other("Solar Street Light") == "light"
    assert classify_other("LED") == "light"


def test_classify_other_fan():
    assert classify_other("Solar Fan") == "fan"


def test_classify_other_fallback_kit():
    assert classify_other("Cable") == "kit"
    assert classify_other("Connector") == "kit"
    assert classify_other("DC Surge Protective Device") == "kit"


def test_build_panel_entry_has_warranty():
    raw = {
        "sku": "SP-005", "category": "solar_panels", "model": "RT6S-M",
        "title_raw": "RT6S-M 340-400W 1956x992x30",
        "wattage": "340-400W", "dimensions": "1956x992x30mm",
        "features": ["IP65", "IP67"], "power_kw": None, "capacity_ah": None,
        "capacity_kwh": None, "voltage": None,
    }
    entry = build_product_entry(raw)
    assert entry["id"] == "SP-005"
    assert entry["cat"] == "panel"
    assert entry["img"] == "SP-005.jpg"
    assert entry["gallery"] == ["SP-005.jpg"]
    assert entry["price"] == 0
    assert entry["warranty"] is not None
    assert entry["warranty"]["product_years"] == 12  # RT6S -> full_cell
    assert "12-year product warranty" in entry["desc"]["en"]
    assert "Garantie produit 12 ans" in entry["desc"]["fr"]
    assert entry["specs"]["en"]["Model"] == "RT6S-M"
    assert entry["specs"]["en"]["Power"] == "340-400W"
    assert entry["specs"]["en"]["Dimensions"] == "1956x992x30mm"
    assert entry["specs"]["en"]["Features"] == "IP65, IP67"
    assert entry["specs"]["fr"]["Modèle"] == "RT6S-M"


def test_build_battery_entry_no_warranty():
    raw = {
        "sku": "BAT-061", "category": "batteries", "model": "RF12-100A",
        "title_raw": "RF12-100A", "wattage": None, "power_kw": None,
        "capacity_ah": "100Ah", "capacity_kwh": None, "voltage": "12/52/57/62V",
        "dimensions": None, "features": [],
    }
    entry = build_product_entry(raw)
    assert entry["cat"] == "battery"
    assert entry["warranty"] is None
    assert "warranty" not in entry["desc"]["en"].lower()
    assert entry["specs"]["en"]["Capacity"] == "100Ah"
    assert entry["specs"]["en"]["Voltage"] == "12/52/57/62V"
    assert "Dimensions" not in entry["specs"]["en"]  # null field must be omitted


def test_build_other_entry_reclassified():
    raw = {
        "sku": "OTH-139", "category": "other", "model": "DC water pump",
        "title_raw": "DC water pump", "wattage": None, "power_kw": None,
        "capacity_ah": None, "capacity_kwh": None, "voltage": None,
        "dimensions": None, "features": [],
    }
    entry = build_product_entry(raw)
    assert entry["cat"] == "pump"


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
    if failed:
        print(f"\n{failed}/{len(tests)} tests failed")
        sys.exit(1)
    print(f"\nAll {len(tests)} tests passed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/test_build_products.py`
Expected: `ModuleNotFoundError: No module named 'build_products'`

- [ ] **Step 3: Write the implementation**

Create `scripts/build_products.py`:

```python
"""
Generates camaroom-web/assets/data/products.js from the rest-solar-agent
2026 catalog (products.json). Rerunnable/idempotent — always overwrites
the full output file.

Run: python3 scripts/build_products.py
Options:
  --catalog-json PATH   default: /Users/lucasfeng/rest-solar-agent/data/catalog_2026/products.json
  --images-src PATH     default: /Users/lucasfeng/rest-solar-agent/static/product_images
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from warranty_classifier import classify_panel_warranty

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG_JSON = Path("/Users/lucasfeng/rest-solar-agent/data/catalog_2026/products.json")
DEFAULT_IMAGES_SRC = Path("/Users/lucasfeng/rest-solar-agent/static/product_images")
OUTPUT_JS = REPO_ROOT / "assets" / "data" / "products.js"
OUTPUT_IMAGES_DIR = REPO_ROOT / "assets" / "products"

CATEGORY_MAP = {
    "solar_panels": "panel",
    "batteries": "battery",
    "inverters": "inverter",
    "ess": "ess",
    "charge_controllers": "controller",
    # "other" is re-classified per-item by classify_other()
}

SPEC_LABELS = {
    "model": {"en": "Model", "fr": "Modèle"},
    "power": {"en": "Power", "fr": "Puissance"},
    "capacity": {"en": "Capacity", "fr": "Capacité"},
    "voltage": {"en": "Voltage", "fr": "Tension"},
    "dimensions": {"en": "Dimensions", "fr": "Dimensions"},
    "features": {"en": "Features", "fr": "Caractéristiques"},
}

CATEGORY_SPEC_FIELDS = {
    "panel":      ["model", "power", "dimensions", "features"],
    "battery":    ["model", "capacity", "voltage", "dimensions", "features"],
    "inverter":   ["model", "power", "voltage", "features"],
    "ess":        ["model", "capacity", "voltage", "dimensions", "features"],
    "controller": ["model", "voltage", "features"],
    "pump":       ["model", "power", "dimensions", "features"],
    "fridge":     ["model", "power", "dimensions", "features"],
    "light":      ["model", "power", "dimensions", "features"],
    "fan":        ["model", "power", "dimensions", "features"],
    "kit":        ["model", "dimensions", "features"],
}

DESC_TEMPLATES = {
    "panel":      {"en": "Monocrystalline solar panel built for Cameroon's heat and daily use.", "fr": "Panneau solaire monocristallin conçu pour la chaleur et l'usage quotidien au Cameroun."},
    "battery":    {"en": "Rechargeable battery for solar energy storage.", "fr": "Batterie rechargeable pour le stockage d'énergie solaire."},
    "inverter":   {"en": "Inverter for converting battery power to usable AC electricity.", "fr": "Onduleur pour convertir l'énergie des batteries en électricité AC utilisable."},
    "ess":        {"en": "All-in-one energy storage system for homes and businesses.", "fr": "Système de stockage d'énergie tout-en-un pour foyers et entreprises."},
    "controller": {"en": "Solar charge controller for regulating panel-to-battery charging.", "fr": "Régulateur de charge solaire pour réguler la charge des panneaux vers la batterie."},
    "pump":       {"en": "Solar-powered water pump for boreholes and wells.", "fr": "Pompe à eau solaire pour forages et puits."},
    "fridge":     {"en": "Solar-compatible refrigeration unit for shops and homes.", "fr": "Unité de réfrigération compatible solaire pour boutiques et foyers."},
    "light":      {"en": "Solar street/area light with built-in battery and panel.", "fr": "Lampadaire solaire avec batterie et panneau intégrés."},
    "fan":        {"en": "Solar-powered fan for cooling homes and shops.", "fr": "Ventilateur solaire pour rafraîchir maisons et boutiques."},
    "kit":        {"en": "Solar accessory for a complete installation.", "fr": "Accessoire solaire pour une installation complète."},
}


def classify_other(title: str | None) -> str:
    t = (title or "").lower()
    if "pump" in t or "water" in t:
        return "pump"
    if "freezer" in t or "fridge" in t or "refrigerat" in t:
        return "fridge"
    if "light" in t or "led" in t:
        return "light"
    if "fan" in t:
        return "fan"
    return "kit"


def _field_value(raw: dict, field_key: str) -> str | None:
    if field_key == "power":
        return raw.get("wattage") or raw.get("power_kw")
    if field_key == "capacity":
        return raw.get("capacity_ah") or raw.get("capacity_kwh")
    if field_key == "model":
        return raw.get("model")
    if field_key == "voltage":
        return raw.get("voltage")
    if field_key == "dimensions":
        return raw.get("dimensions")
    if field_key == "features":
        feats = raw.get("features")
        return ", ".join(feats) if feats else None
    raise ValueError(f"unknown spec field key: {field_key}")


def build_specs(raw: dict, cat: str) -> dict:
    fields = CATEGORY_SPEC_FIELDS.get(cat, ["model", "features"])
    specs_en, specs_fr = {}, {}
    for field_key in fields:
        value = _field_value(raw, field_key)
        if value is None or value == "":
            continue
        label = SPEC_LABELS[field_key]
        specs_en[label["en"]] = value
        specs_fr[label["fr"]] = value
    return {"en": specs_en, "fr": specs_fr}


def build_desc(cat: str, warranty: dict | None) -> dict:
    template = DESC_TEMPLATES[cat]
    desc_en, desc_fr = template["en"], template["fr"]
    if warranty is not None:
        desc_en += (
            f" {warranty['product_years']}-year product warranty · "
            f"{warranty['performance_years']}-year performance warranty "
            f"({warranty['output_pct_en']} output guaranteed)."
        )
        desc_fr += (
            f" Garantie produit {warranty['product_years']} ans · "
            f"Garantie de performance {warranty['performance_years']} ans "
            f"({warranty['output_pct_fr']} de rendement garanti)."
        )
    return {"en": desc_en, "fr": desc_fr}


def build_product_entry(raw: dict) -> dict:
    source_cat = raw["category"]
    cat = CATEGORY_MAP.get(source_cat) or classify_other(raw.get("title_raw"))
    sku = raw["sku"]
    img_filename = f"{sku}.jpg"

    warranty = classify_panel_warranty(raw.get("model")) if source_cat == "solar_panels" else None
    name = raw.get("model") or raw.get("title_raw") or sku

    return {
        "id": sku,
        "cat": cat,
        "img": img_filename,
        "gallery": [img_filename],
        "name": name,
        "price": 0,
        "desc": build_desc(cat, warranty),
        "specs": build_specs(raw, cat),
        "warranty": warranty,
    }


def _js_string(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_products_js(entries: list[dict]) -> str:
    lines = ["// Generated by scripts/build_products.py — do not edit by hand.", "const PRODUCTS = ["]
    for e in entries:
        warranty_js = "null" if e["warranty"] is None else _js_string(e["warranty"])
        lines.append(
            "  {id:%s, cat:%s, img:%s, gallery:%s, name:%s, price:%s, "
            "desc:%s, specs:%s, warranty:%s},"
            % (
                _js_string(e["id"]), _js_string(e["cat"]), _js_string(e["img"]),
                _js_string(e["gallery"]), _js_string(e["name"]), e["price"],
                _js_string(e["desc"]), _js_string(e["specs"]), warranty_js,
            )
        )
    lines.append("];")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog-json", type=Path, default=DEFAULT_CATALOG_JSON)
    parser.add_argument("--images-src", type=Path, default=DEFAULT_IMAGES_SRC)
    args = parser.parse_args()

    raw_products = json.loads(args.catalog_json.read_text(encoding="utf-8"))
    entries = [build_product_entry(r) for r in raw_products]

    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JS.write_text(render_products_js(entries), encoding="utf-8")
    print(f"Wrote {len(entries)} products to {OUTPUT_JS}")

    OUTPUT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    copied, missing = 0, []
    for raw in raw_products:
        src = args.images_src / f"{raw['sku']}.jpg"
        dst = OUTPUT_IMAGES_DIR / f"{raw['sku']}.jpg"
        if src.exists():
            shutil.copyfile(src, dst)
            copied += 1
        else:
            missing.append(raw["sku"])
    print(f"Copied {copied} product images to {OUTPUT_IMAGES_DIR}")
    if missing:
        print(f"WARNING: {len(missing)} SKUs had no source image: {missing}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/test_build_products.py`
Expected: `All 9 tests passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/build_products.py scripts/test_build_products.py
git commit -m "Add product catalog build script (products.json -> products.js)"
```

---

### Task 3: Generate the real data and images

**Files:**
- Create (generated): `assets/data/products.js`
- Create (generated): `assets/products/*.jpg` (169 files)

**Interfaces:**
- Consumes: `main()` from Task 2 (`scripts/build_products.py`).
- Produces: `assets/data/products.js` defining global `const PRODUCTS = [...]` (169 entries) — consumed by Task 5's `<script src>` include.

- [ ] **Step 1: Run the build script**

Run: `python3 scripts/build_products.py`
Expected output: `Wrote 169 products to .../assets/data/products.js` and `Copied 169 product images to .../assets/products` with **no** `WARNING: ... missing` line. If a warning does appear, stop and investigate the SKU mismatch before continuing (do not proceed with missing images silently).

- [ ] **Step 2: Spot-check the generated file**

Run: `python3 -c "
import json, re
text = open('assets/data/products.js', encoding='utf-8').read()
assert text.startswith('// Generated by scripts/build_products.py')
assert text.count('{id:') == 169, text.count('{id:')
assert 'warranty:null' in text  # non-panel entries
assert '\"assumed\":true' in text  # the 16 assumed-family panels
print('OK: 169 entries, warranty fields present')
"`

Expected: `OK: 169 entries, warranty fields present`

- [ ] **Step 3: Verify image count**

Run: `ls assets/products/*.jpg | wc -l`
Expected: `169`

- [ ] **Step 4: Commit the generated data**

```bash
git add assets/data/products.js assets/products/
git commit -m "Generate 169-product catalog data and images from 2026 catalog"
```

---

### Task 4: Wire products.js into index.html, retire the old 77-item array

**Files:**
- Modify: `index.html:505` (add script include)
- Modify: `index.html:517-826` (remove old inline `PRODUCTS` array)

**Interfaces:**
- Consumes: global `PRODUCTS` array now defined in `assets/data/products.js` (Task 3) instead of inline.
- Produces: no new interface — `renderGrid`/`renderFilters`/`openModal` (unchanged, further down in the same file) now read from the externally-loaded `PRODUCTS`.

- [ ] **Step 1: Add the script include**

In `index.html`, immediately before the existing `<script>` tag at line 505 (right after the lightbox `</div>` at line 504 and before `const CONFIG = ...`), add:

```html
<script src="assets/data/products.js"></script>
```

- [ ] **Step 2: Remove the old inline PRODUCTS array**

Delete lines 517 (`const PRODUCTS = [`) through 826 (`];`) inclusive — the entire old 77-item array. The line immediately after (currently 827, `const OFFER = [`) becomes the next line after the now-removed block.

- [ ] **Step 3: Verify the file is well-formed**

Run: `python3 -c "
text = open('index.html', encoding='utf-8').read()
assert text.count('const PRODUCTS') == 0, 'old inline array still present'
assert 'assets/data/products.js' in text
assert 'const OFFER = [' in text
print('OK')
"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Load product catalog from assets/data/products.js instead of inline array"
```

---

### Task 5: Add the Warranty section

**Files:**
- Modify: `index.html` (nav, mobile nav, footer, new `#warranty` section, `I18N` dict, `WARRANTY_TABLE` data + render function)

**Interfaces:**
- Consumes: existing `I18N`, `t()`, `lang`, `applyI18n()` (unchanged patterns from the file).
- Produces: `renderWarranty()` function, called once at page-init time alongside the existing `renderOffer()`/`renderWhy()` calls.

- [ ] **Step 1: Add nav links**

In `index.html`, in the desktop nav (`<nav class="nav-links" id="navLinks">`, currently lines 275-283), add a warranty link after the Certificates link (currently line 279):

```html
      <a href="#warranty" data-i18n="nav.warranty">Warranty</a>
```

Do the same in the mobile/footer nav block that duplicates these links (currently around line 462, inside the second `<nav ...>` copy) and in the footer "Explore" column (currently around line 462 in the footer, after the Certificates line):

```html
          <a href="#warranty" data-i18n="nav.warranty">Warranty</a>
```

(There are three places `nav.certs`/`#certs` currently appears as a link: desktop nav, mobile nav, footer — add the warranty link right after each one.)

- [ ] **Step 2: Add the `#warranty` section HTML**

In `index.html`, insert a new section immediately after the `</section>` that closes `#certs` (currently line 367) and before `<section class="section" id="about">` (currently line 368):

```html
<section class="section section--mist" id="warranty">
  <div class="wrap">
    <div class="head-row">
      <div>
        <span class="eyebrow" data-i18n="warranty.eyebrow">Warranty</span>
        <h2 class="h-lead" data-i18n="warranty.title">RESTAR manufacturer's warranty</h2>
      </div>
      <p class="sub-lead" style="margin-top:0" data-i18n="warranty.sub">Panels sold by Rest Solar are covered by the official RESTAR manufacturer's warranty (effective Jan 1, 2026).</p>
    </div>
    <div class="why-grid reveal" id="warrantyTypes"></div>
    <table class="spec-table" style="margin-top:32px" id="warrantyTable"></table>
    <div class="about-copy reveal" style="margin-top:32px">
      <h3 class="h-lead" style="font-size:1.2rem" data-i18n="warranty.exclTitle">What's not covered</h3>
      <p data-i18n="warranty.excl">Improper installation, repairs by unapproved technicians, altered or removed serial numbers, mobile or marine mounting, storm/lightning/flood damage, cosmetic wear that doesn't affect performance, and external glass breakage are not covered by the manufacturer warranty.</p>
      <h3 class="h-lead" style="font-size:1.2rem;margin-top:20px" data-i18n="warranty.claimTitle">Making a claim</h3>
      <p data-i18n="warranty.claim">Contact Rest Solar on WhatsApp with your panel's serial number, photos of the issue, and proof of purchase. Do not remove or damage the serial number label. RESTAR must be notified within 3 months of discovering the defect.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add `WARRANTY_TYPES` and `WARRANTY_TABLE` data + render function**

In `index.html`, in the `<script>` block, immediately after the existing `const WHY = [...]` array (currently ending around line 838), add:

```javascript
const WARRANTY_TYPES = [
  {t:{en:"Product warranty",fr:"Garantie produit"}, d:{en:"Covers defects in design, material, and workmanship — 10 to 15 years depending on panel type.",fr:"Couvre les défauts de conception, de matériau et de fabrication — de 10 à 15 ans selon le type de panneau."}},
  {t:{en:"Performance warranty",fr:"Garantie de performance"}, d:{en:"Guarantees minimum power output over 20 to 30 years, measured against the panel's original rated power.",fr:"Garantit un rendement minimum sur 20 à 30 ans, mesuré par rapport à la puissance nominale d'origine du panneau."}}
];
const WARRANTY_TABLE = [
  {family:{en:"Cutting-cell",fr:"Cellules découpées"}, product:"10", perf:"20", output:{en:"≥80.7%",fr:"≥80,7 %"}},
  {family:{en:"Full-cell",fr:"Cellule entière"}, product:"12", perf:"25", output:{en:"≥80.7%",fr:"≥80,7 %"}},
  {family:{en:"Half-cell & full black",fr:"Demi-cellule et full black"}, product:"15", perf:"30", output:{en:"≥83%",fr:"≥83 %"}},
  {family:{en:"Bifacial",fr:"Bifacial"}, product:"15", perf:"30", output:{en:"≥84.95%",fr:"≥84,95 %"}}
];
function renderWarranty(){
  document.getElementById("warrantyTypes").innerHTML = WARRANTY_TYPES.map(w=>`<div class="why-card"><h3>${w.t[lang]}</h3><p>${w.d[lang]}</p></div>`).join("");
  const head = lang==='fr'
    ? `<tr><td><b>Famille</b></td><td><b>Garantie produit</b></td><td><b>Garantie performance</b></td><td><b>Rendement garanti</b></td></tr>`
    : `<tr><td><b>Family</b></td><td><b>Product warranty</b></td><td><b>Performance warranty</b></td><td><b>Output guarantee</b></td></tr>`;
  const rows = WARRANTY_TABLE.map(r=>`<tr><td>${r.family[lang]}</td><td>${r.product} ${lang==='fr'?'ans':'yr'}</td><td>${r.perf} ${lang==='fr'?'ans':'yr'}</td><td>${r.output[lang]}</td></tr>`).join("");
  document.getElementById("warrantyTable").innerHTML = head + rows;
}
```

- [ ] **Step 4: Call `renderWarranty()` at init and re-render on language switch**

In `index.html`, find where `renderOffer()` and `renderWhy()` are currently called at page-init (search for `renderWhy();` — it's called once on load and again inside the language-toggle handler, alongside `renderOffer()`/`renderGrid()`/`renderFilters()`). Add `renderWarranty();` immediately after each existing `renderWhy();` call (there should be exactly two: one in the initial page-load sequence, one in the language-switch handler).

- [ ] **Step 5: Add `I18N` keys**

In `index.html`, in the `I18N.en` object, immediately after the existing `"certs.sub":"..."` line, add:

```javascript
    "nav.warranty":"Warranty",
    "warranty.eyebrow":"Warranty","warranty.title":"RESTAR manufacturer's warranty",
    "warranty.sub":"Panels sold by Rest Solar are covered by the official RESTAR manufacturer's warranty (effective Jan 1, 2026).",
    "warranty.exclTitle":"What's not covered",
    "warranty.excl":"Improper installation, repairs by unapproved technicians, altered or removed serial numbers, mobile or marine mounting, storm/lightning/flood damage, cosmetic wear that doesn't affect performance, and external glass breakage are not covered by the manufacturer warranty.",
    "warranty.claimTitle":"Making a claim",
    "warranty.claim":"Contact Rest Solar on WhatsApp with your panel's serial number, photos of the issue, and proof of purchase. Do not remove or damage the serial number label. RESTAR must be notified within 3 months of discovering the defect."
```

In the `I18N.fr` object, immediately after the existing `"certs.sub":"..."` line, add:

```javascript
    "nav.warranty":"Garantie",
    "warranty.eyebrow":"Garantie","warranty.title":"Garantie fabricant RESTAR",
    "warranty.sub":"Les panneaux vendus par Rest Solar sont couverts par la garantie officielle du fabricant RESTAR (en vigueur depuis le 1er janvier 2026).",
    "warranty.exclTitle":"Ce qui n'est pas couvert",
    "warranty.excl":"Une installation incorrecte, des réparations par des techniciens non agréés, un numéro de série altéré ou retiré, un montage mobile ou marin, les dommages liés aux intempéries/foudre/inondation, l'usure cosmétique sans impact sur la performance, et le bris de verre d'origine externe ne sont pas couverts par la garantie du fabricant.",
    "warranty.claimTitle":"Faire une réclamation",
    "warranty.claim":"Contactez Rest Solar sur WhatsApp avec le numéro de série du panneau, des photos du problème et une preuve d'achat. Ne retirez pas et n'endommagez pas l'étiquette du numéro de série. RESTAR doit être informé dans les 3 mois suivant la découverte du défaut."
```

- [ ] **Step 6: Verify the file is well-formed**

Run: `python3 -c "
text = open('index.html', encoding='utf-8').read()
assert text.count('id=\"warranty\"') == 1
assert text.count('renderWarranty()') == 3  # 1 definition + 2 call sites
assert '\"nav.warranty\":\"Warranty\"' in text
assert '\"nav.warranty\":\"Garantie\"' in text
print('OK')
"`

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Add #warranty section with RESTAR coverage table (EN/FR)"
```

---

### Task 6: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Serve the site locally**

Run: `python3 -m http.server 8899` (from the repo root, in the background/a separate terminal)

- [ ] **Step 2: Open in browser and check the product grid**

Navigate to `http://127.0.0.1:8899/index.html#products`. Confirm:
- The grid renders with more than 77 cards (169 total across all categories).
- Filter chips include Panels, Batteries, Inverters, ESS, Controllers, Water pumps, Refrigeration, Lighting, Fans, and Kits (whichever categories the real data produced).
- Opening a solar panel card's "Details" modal shows a populated spec table (Model/Power/Dimensions/Features rows) and the card's description ends with a warranty line, e.g. "...15-year product warranty · 30-year performance warranty (≥83% output guaranteed)."
- Opening a battery or inverter card shows no warranty line in the description.

- [ ] **Step 3: Check the Warranty section**

Navigate to `http://127.0.0.1:8899/index.html#warranty`. Confirm the section renders: two warranty-type cards, the 4-row family table, exclusions text, and claims text. Click the language toggle (if present in the header) and confirm the section re-renders in French — table headers and family names should switch language.

- [ ] **Step 4: Check nav/footer links**

Confirm the new "Warranty" link appears in the desktop nav, mobile nav (hamburger menu), and footer "Explore" column, and each one scrolls to `#warranty`.

- [ ] **Step 5: Stop the local server**

Stop the `python3 -m http.server` process (Ctrl-C or kill the background job).

This task has no commit — it's verification of Tasks 1-5, which are already committed.
