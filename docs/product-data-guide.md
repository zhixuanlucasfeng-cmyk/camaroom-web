# Adding / editing products

Product data lives in `assets/data/products.js` (one file per site — each of
Nigeria-website, Sudan-website, Mali-website, and camaroom-web itself has its
own copy, since local staff upload real photos/stock for their own country).

Each product is one object in the `PRODUCTS` array:

```js
{
  id: "SP-005",              // unique SKU, used as the URL-safe id
  cat: "panel",               // panel | battery | inverter | ess | controller | pump | fridge | light | fan | kit
  img: "SP-005.jpg",          // fallback single image, file lives in assets/products/
  gallery: ["SP-005.jpg"],    // photos shown in the product detail popup — see "Photos" below
  name: "RT6S-M",
  price: 0,                   // 0 = "Contact for price" instead of a number
  desc: {"en": "...", "fr": "..."},
  specs: {"en": {"Model": "RT6S-M", "Power": "340-400W"}, "fr": {...}},
}
```

## Specs table (Model / Power / Dimensions / Features, etc.)

`specs.en` / `specs.fr` are plain key → value pairs, not a fixed set of
columns — the detail page just renders one table row per key. There's no
hard limit and no code change needed to:

- Add a new field, e.g. `"Voltage": "12V"` — just add the key.
- List as many rows as a product actually needs (5, 10, whatever).

Keep the same keys on both `specs.en` and `specs.fr` (translated), in the
same order, so the two languages show the same rows.

## Photos (multiple images, left/right browsing)

Set `gallery` to as many filenames as you have real photos for that
product, e.g. `["SP-005.jpg", "SP-005-b.jpg", "SP-005-c.jpg"]`. The detail
popup automatically shows left/right arrows plus thumbnails once a product
has more than one photo — no other setup needed. Files go in
`assets/products/`.

**Recommended image size:** roughly landscape or square, around
**1200×900px** (4:3) or **1200×750px** (16:10) works best — the product
card crops to a 16:10 box and the detail popup letterboxes to fit, so very
tall/narrow photos (e.g. a portrait shot much taller than wide) will look
small and heavily padded. JPEG, under ~500KB per photo so the site stays
fast to load, no minimum resolution but avoid anything below ~600px on the
short side (looks blurry once scaled up).

## Warranty data

Products can still carry a `warranty: {product_years, performance_years, ...}`
field (or `null`) — it's kept as data but is **not shown anywhere on the
site** (removed 2026-08-13 per local sales feedback: proactively quoting
warranty length to customers was creating after-sales disputes). Don't add
warranty wording back into `desc` — see `scripts/build_products.py`'s
`build_desc()` for why.
