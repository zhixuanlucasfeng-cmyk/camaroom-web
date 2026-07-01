# Merge Factory + Gallery into the white-theme homepage

## Context

The site has gone through two parallel, divergent lines of work:

- `index_restar.html` — the current white-theme redesign (real `logo.webp`, real
  `hero-bg.mp4` background, real WhatsApp contacts for both salesmen: Luc Su in
  Cameroon and Tom Yang in China). Its full product/certificate data (77
  products, 5 certificates) is already present and identical to the other
  files. Factory and Gallery are separate page loads (`factory.html`,
  `gallery.html`), still in the old dark theme, and out of sync visually with
  the rest of the site.
- `whole_website_camaroon.html` — an older, dark-themed, untracked file that
  merged Factory and Gallery into the same page as anchor sections, using a
  JS-driven "one section visible at a time" navigation scheme. It references
  `assets/video/background.mp4`, which does not exist on disk (the working
  video file is `hero-bg.mp4` at the repo root).
- `factory.html` / `gallery.html` — standalone dark-theme pages. `gallery.html`
  evolved independently after `whole_website_camaroon.html` was created and is
  measurably better: it renders thumbnails (`assets/gallery/thumb/`) in the
  grid and only loads full-size images (`assets/gallery/full/`) in the
  lightbox, and it groups photos under category headers when "All" is
  selected. The embedded gallery in `whole_website_camaroon.html` loads
  full-size images directly in the grid (heavier) and has no grouping.

Goal: produce one homepage, in the current white theme, that includes Factory
and Gallery as in-page sections instead of separate page loads — without
losing the newer, real (white-theme, real contacts) work already done in
`index_restar.html`, and without regressing gallery performance/UX by pulling
in the weaker of the two gallery implementations.

## Scope

In scope:
- A new file, `index_new.html`, cloned from `index_restar.html`.
- Two new sections added to it: `#factory` and `#gallery`.
- Nav updates (header, mobile menu, quick-nav pills, footer) so Factory/Gallery
  become in-page anchors instead of links to separate pages.
- A shared, prev/next-capable lightbox for certificates, factory photos, and
  gallery photos (extending the existing single-image cert lightbox).
- White-theme CSS for the ported Factory/Gallery layout (steps, photo grid,
  filter chips, category headers), hooked into the existing scroll-reveal
  animation system.

Out of scope (explicitly deferred, not part of this change):
- Deleting or renaming any existing file. `index.html`, `index_restar.html`,
  `factory.html`, `gallery.html`, and `whole_website_camaroon.html` are left
  untouched as backups. Which of them (if any) get deleted, and whether
  `index_new.html` becomes the file actually served as the homepage, is a
  decision for later, after the merged page has been reviewed.
- Any redesign of the existing sections (hero, offer, products, why, certs,
  about, contact) — those carry over from `index_restar.html` unchanged.
- Any change to contact info, WhatsApp numbers, logo, or hero video.

## Sections added

### `#factory`

Positioned after `#about`, before `#gallery`. Content ported verbatim from
`factory.html` / `whole_website_camaroon.html`:
- Eyebrow "Inside Restar Solar", heading "Our factory & production line", and
  the existing descriptive paragraph about the ISO-9001 factory.
- The 4-step process explainer (cell stringing → lay-up & lamination → EL
  testing & framing → quality control).
- A 21-photo grid of the factory floor (`assets/gallery/full/001.jpg`,
  `041.jpg`, `042.jpg`, `044–048.jpg`, `050–062.jpg` — the same fixed list
  used in both existing implementations).

### `#gallery`

Positioned after `#factory`, before `#contact`. Ported from `gallery.html`
(the better of the two existing implementations), re-themed for white and
embedded as a section rather than a standalone page:
- Eyebrow "Photo library", heading "Full gallery", intro text ("Every
  product, project, factory and certificate photo in one place — 336
  images...").
- Filter chips: All / Products / Projects / Factory / Company / Certificates.
- Grid rendering:
  - When a single category is active: a masonry grid of that category's
    thumbnails only.
  - When "All" is active: photos grouped under category headers (icon +
    label + photo count per group), matching `gallery.html`'s grouped
    behavior — not the flat ungrouped grid from `whole_website_camaroon.html`.
  - Grid images always load from `assets/gallery/thumb/`; only the lightbox
    loads from `assets/gallery/full/`.
- The exact 336-item `ITEMS` array (id + category) is carried over unchanged
  from `gallery.html`.

## Navigation changes

Every place that currently links to `factory.html` or `gallery.html` (desktop
nav, mobile nav, quick-nav pills under the hero, footer links) changes to
`#factory` / `#gallery` respectively, so they behave like the existing
`#products` / `#certs` / `#contact` anchors: smooth-scroll to the section
within the same continuously-scrolling page. This intentionally does **not**
adopt the click-to-swap "only one section visible at a time" navigation
pattern from `whole_website_camaroon.html` — `index_restar.html`'s existing
pattern (one long scrolling page, `IntersectionObserver`-driven reveal
animations) is kept as-is and simply extended to cover the two new sections.

## Shared lightbox

The existing certificate lightbox (`#lightbox` / `#lbImg`, currently
single-image, opened from the certs section) is extended to:
- Accept an ordered list of image paths and a starting index (rather than
  always a single image).
- Show prev/next controls when the list has more than one image, hidden
  otherwise (so it still works unchanged for single-certificate clicks).
- Be reused by both the Factory grid and the Gallery grid, so there is one
  lightbox implementation instead of three separate ones.

## Visual style adaptation

The CSS for `.steps`, `.fgrid`, `.gal` (masonry columns), `.sec-block` /
`.sec-head` (category group headers), and `.filters` / `.chip` is ported from
the dark-theme files but re-expressed using `index_restar.html`'s existing
white-theme custom properties (`var(--panel)`, `var(--panel-2)`, `var(--line)`,
`var(--bg-2)`, `var(--text)`, `var(--muted)`) instead of the hardcoded dark
values in the source files (e.g. `background:#0d0a16`, `color:#fff`). Section
headings and photo grid items are hooked into the existing `.reveal` /
`IntersectionObserver` "in" pattern already used by other sections on the
page, so Factory and Gallery animate in on scroll consistently with the rest
of the site.

## Data / assets

- Factory photo list (21 images) and Gallery `ITEMS` array (336 entries,
  category-tagged) are copied verbatim — no changes to which photos appear in
  which category.
- All image paths point at `assets/gallery/thumb/` (grid) and
  `assets/gallery/full/` (lightbox), both confirmed present on disk (336 files
  each).
- Hero video stays `hero-bg.mp4` (confirmed present at repo root); the
  `assets/video/background.mp4` path referenced by the old dark files is not
  used, since that file does not exist.
- `CONFIG` (WhatsApp numbers, contacts), `logo.webp`, and the `PRODUCTS`/
  `CERTS` data arrays are untouched — they are already identical across
  `index_restar.html` and the older files.

## Testing / verification

- Load `index_new.html` in a browser; confirm Factory and Gallery sections
  render, nav links scroll to them, filters work, and the shared lightbox
  opens/closes/navigates for certs, factory photos, and gallery photos.
- Spot-check a sample of thumbnail and full-size image paths against the
  actual files in `assets/gallery/thumb/` and `assets/gallery/full/` to catch
  any off-by-one or missing-file issues before considering this done.
