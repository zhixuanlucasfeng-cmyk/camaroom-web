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
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from warranty_classifier import classify_panel_warranty


def _clean_model_string(model: str | None) -> str | None:
    """Strip leading non-ASCII characters from a model string.

    Some source data (e.g., SP-137) has garbled prefixes like "中文" (Chinese
    for "Chinese text") that are artifacts of PDF text extraction. This removes
    them while leaving the rest of the string unchanged.

    Examples:
      "中文RT8I-M-DG TOPCON 560-585W..." -> "RT8I-M-DG TOPCON 560-585W..."
      "DC water pump" -> "DC water pump" (no change)
      "RF12-100A" -> "RF12-100A" (no change)
    """
    if not model:
        return model
    # Remove leading non-ASCII characters and strip whitespace
    cleaned = re.sub(r'^[^\x00-\x7F]+', '', model).strip()
    return cleaned if cleaned else model


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
        return _clean_model_string(raw.get("model"))
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
    cleaned_model = _clean_model_string(raw.get("model"))
    name = cleaned_model or raw.get("title_raw") or sku

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
