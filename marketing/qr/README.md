# QR codes for print and showroom display

16 codes: four countries x four materials. Each one carries a different
`utm_source`, so analytics can tell a scan from a business card apart from a
scan off a showroom poster. Without that they all arrive as one anonymous lump
of direct traffic.

Every code was decoded after generation and verified to carry exactly the URL
below — 16/16 matched.

## Files

- `svg/` — vector. **Use these for print.** They scale to any size with no
  resampling, so the same file works on a business card and on a wall poster.
- `png/` — 1240px raster, for anything that cannot take an SVG (some social
  tools, some sign shops).
- `urls.json` — the exact URL behind each code, machine-readable.

| Country | Material | Files | Lands on |
|---|---|---|---|
| Cameroon | namecard | `svg/cm-namecard.svg` · `png/cm-namecard.png` | `?country=cm&utm_source=namecard` |
| Cameroon | flyer | `svg/cm-flyer.svg` · `png/cm-flyer.png` | `?country=cm&utm_source=flyer` |
| Cameroon | poster | `svg/cm-poster.svg` · `png/cm-poster.png` | `?country=cm&utm_source=poster` |
| Cameroon | showroom | `svg/cm-showroom.svg` · `png/cm-showroom.png` | `?country=cm&utm_source=showroom` |
| Mali | namecard | `svg/ml-namecard.svg` · `png/ml-namecard.png` | `?country=ml&utm_source=namecard` |
| Mali | flyer | `svg/ml-flyer.svg` · `png/ml-flyer.png` | `?country=ml&utm_source=flyer` |
| Mali | poster | `svg/ml-poster.svg` · `png/ml-poster.png` | `?country=ml&utm_source=poster` |
| Mali | showroom | `svg/ml-showroom.svg` · `png/ml-showroom.png` | `?country=ml&utm_source=showroom` |
| Nigeria | namecard | `svg/ng-namecard.svg` · `png/ng-namecard.png` | `?country=ng&utm_source=namecard` |
| Nigeria | flyer | `svg/ng-flyer.svg` · `png/ng-flyer.png` | `?country=ng&utm_source=flyer` |
| Nigeria | poster | `svg/ng-poster.svg` · `png/ng-poster.png` | `?country=ng&utm_source=poster` |
| Nigeria | showroom | `svg/ng-showroom.svg` · `png/ng-showroom.png` | `?country=ng&utm_source=showroom` |
| Sudan | namecard | `svg/sd-namecard.svg` · `png/sd-namecard.png` | `?country=sd&utm_source=namecard` |
| Sudan | flyer | `svg/sd-flyer.svg` · `png/sd-flyer.png` | `?country=sd&utm_source=flyer` |
| Sudan | poster | `svg/sd-poster.svg` · `png/sd-poster.png` | `?country=sd&utm_source=poster` |
| Sudan | showroom | `svg/sd-showroom.svg` · `png/sd-showroom.png` | `?country=sd&utm_source=showroom` |

## Printing

- **Error correction Q (25%)**, so a code still scans when scuffed, folded, or
  with a logo dropped in the middle.
- **Keep the white border.** It is the quiet zone; scanners need it. Do not
  crop to the black edge.
- **Minimum 2cm square** on a business card, **and at least 8cm** on a poster
  meant to be scanned from a couple of metres away. Bigger is always safer.
- Print **dark on light**. Inverted codes fail on many older Android scanners,
  which is most of this audience.
- Do not stretch. Keep it square.

## Test before the print run

Scan the actual proof with a real phone, not the file on screen. A code that
scans on a monitor can still fail on paper at the size and contrast the
printer delivers.

## Adding a material later

`scripts/make_qr.py` regenerates everything. Add an entry to `MATERIALS` and
rerun it; existing files are overwritten in place, so the codes already in
print keep working.
