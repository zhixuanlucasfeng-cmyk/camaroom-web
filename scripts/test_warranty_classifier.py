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
