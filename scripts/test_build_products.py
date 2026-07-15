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
