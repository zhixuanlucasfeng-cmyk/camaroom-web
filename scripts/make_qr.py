"""Regenerates marketing/qr — print-ready QR codes for the country sites,
one per material so the traffic each one brings can be told apart.

Run: scripts/make_qr.py marketing/qr   (needs segno)
"""
import segno, pathlib, json, sys

BASE = "https://restarsolar.net/"
OUT = pathlib.Path(sys.argv[1])

COUNTRIES = {
    "cm": "Cameroon",
    "ml": "Mali",
    "ng": "Nigeria",
    "sd": "Sudan",
}
# utm_source identifies the physical thing the code is printed on.
MATERIALS = {
    "namecard": "print",
    "flyer":    "print",
    "poster":   "print",
    "showroom": "display",
}

manifest = []
for code, name in COUNTRIES.items():
    for source, medium in MATERIALS.items():
        url = f"{BASE}?country={code}&utm_source={source}&utm_medium={medium}&utm_campaign={code}_launch"
        stem = f"{code}-{source}"
        # Error correction Q (25%): print gets scuffed, folded and reprinted,
        # and a poster may later get a logo dropped in the middle.
        qr = segno.make(url, error="q")
        (OUT / "svg").mkdir(parents=True, exist_ok=True)
        (OUT / "png").mkdir(parents=True, exist_ok=True)
        # Vector for print — scales to any size with no resampling.
        qr.save(OUT / "svg" / f"{stem}.svg", scale=10, border=4, dark="#111111")
        # Raster fallback, ~1200px: comfortably enough for a 5cm print at 600dpi.
        qr.save(OUT / "png" / f"{stem}.png", scale=20, border=4, dark="#111111")
        manifest.append({"country": code, "country_name": name, "material": source,
                         "url": url, "svg": f"svg/{stem}.svg", "png": f"png/{stem}.png",
                         "version": qr.version, "error": "Q"})

(OUT / "urls.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"generated {len(manifest)} codes")
