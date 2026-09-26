# Restar Solar Proof-Led Redesign

Date: 2026-09-26  
Status: Approved by user ("ok")  
Scope: `restarsolar.net` public storefront first, then the country-scoped employee admin

## 1. Objective

Replace the current synthetic landing-page look with a credible solar-equipment experience built from verifiable product information, real operational evidence, and direct access to the correct country team. Remove the current hero video/poster and any decorative or uncertain-origin photography from prominent presentation. The public site and employee admin must feel like two sides of the same Restar Solar operating system.

## 2. Product truth that remains unchanged

- One public domain serves Cameroon, Mali, Nigeria, Sudan, and an international fallback.
- Country choice controls language defaults, contacts, catalogue/inventory behavior, ordering availability, and human handoff.
- The catalogue, cart where enabled, WhatsApp routing, certificates, AI chat, and human takeover remain functional.
- Country employees manage only their assigned country's conversations, products, stock, and orders; higher roles retain broader access.
- Prices and availability change. The interface and AI must encourage confirmation rather than presenting an old value as guaranteed.
- English, French, and Arabic remain supported, including right-to-left behavior.

## 3. Chosen visual world: The Verified Equipment Record

The website should resemble a carefully maintained technical equipment record rather than an advertising template.

### Materials and tone

- Warm technical-paper backgrounds instead of glass effects or dramatic gradients.
- Deep Restar navy for structure, graphite for text, and a single safety-orange marker for current country, active state, or primary action.
- Thin rules, reference numbers, tabular values, inspection-style status labels, and strong typographic hierarchy.
- White space and concise language keep the system approachable rather than bureaucratic.

### Typography

- Use a durable system sans-serif stack for multilingual reliability and performance.
- Headings are direct and compact; specifications use tabular numerals where useful.
- No gradient-filled text, glowing display type, fake handwriting, excessive all-caps, or decorative monospaced body copy.

### Interaction grammar

- Country selection behaves like switching the active country record and remains highly visible.
- Product details behave like specification sheets: model, category, important values, availability language, datasheet, and inquiry action.
- Status never relies on color alone; state is named in text.
- Motion is limited to short functional transitions. No motes, parallax, autoplay decoration, floating effects, or animation that delays information.

## 4. Public storefront composition

### First viewport

The first viewport contains no hero photograph or video. It includes:

1. A compact utility strip with current country, language, contact, and cart state.
2. A restrained primary navigation.
3. A two-column equipment-record header:
   - clear country-specific promise and short explanation;
   - four direct paths: panels, batteries, inverters, and complete systems;
   - primary actions for catalogue and local support;
   - a proof panel showing real counts or facts already supported by repository data, such as supported countries, product families, and available certification documents. No invented business metrics.
4. A visible current-country marker and local support contact.

### Visitor path

1. Identify country and language.
2. Choose a product family or browse the catalogue.
3. Compare real product records and open a specification sheet.
4. Review certifications and available support documents.
5. Contact the correct local team, request a current quote, or ask for human help.

### Sections

- Product family index
- Searchable/filterable product records
- Country service and fulfillment facts
- Certification/document library
- About/operating promise using factual copy only
- Structured inquiry form and direct country contacts

### Product media policy

- Keep product images only when they show the actual product and have traceable repository/catalogue provenance.
- Keep certification scans and datasheets as documentary evidence.
- Do not prominently use `hero-bg.mp4`, `assets/video/poster.jpg`, or uncertain farm/gallery images until provenance is recorded.
- When an image is missing or uncertain, show a clean category diagram/label created with HTML/CSS/SVG primitives—not a generated image.
- Do not import competitor photography.

## 5. Employee admin composition

### Shell

- Replace the single blue Tailwind strip with a persistent, responsive operational shell.
- Desktop: compact left navigation with current country/role and clear active state.
- Mobile: top bar and accessible navigation drawer.
- Use the same navy, graphite, warm neutral, and safety-orange system as the public site.

### Dashboard

- Lead with actionable queues rather than decorative KPI cards.
- Clearly show waiting chats, open orders/tickets, stock attention, and recent operational activity supported by existing data.

### Live inbox

- Queue, conversation, ownership, and takeover state must be unmistakable.
- Customer and staff messages use restrained surfaces and explicit sender labels/timestamps where available.
- Keep Enter for newline and Ctrl/Command+Enter for send.
- Primary action changes with state: Take over, Send, Release to AI.

### Products and orders

- Product list becomes a responsive operational table/list with strong filters and status labels.
- Add/edit forms group identity, specifications, commercial state, documents, and media.
- Country restrictions and read-only states are visible before action.
- Destructive actions receive clear separation and confirmation behavior where already supported or safely addable.

## 6. Reference lessons, not copied styling

- LONGi: clear product/solution hierarchy and dedicated proof/support resources.
- Victron Energy: product pages center model variants, real product imagery, datasheets, manuals, dimensions, and certificates.
- Restar Solar will use these structural lessons while retaining its own country routing, local-team access, catalogue, and operational admin.

## 7. Responsive and accessibility requirements

- Public site and admin must work at 360px mobile width and common laptop/desktop widths.
- Preserve keyboard navigation, visible focus, form labels, semantic heading order, meaningful alternative text, reduced-motion behavior, and Arabic RTL.
- No horizontal page overflow.
- Touch targets should be at least 44px where practical.
- Status and errors must include text, not color alone.

## 8. Performance requirements

- Remove the hero video from page delivery and remove poster preload/social preview dependency.
- Avoid new frontend frameworks or large component libraries.
- Keep the static storefront deploy model and existing backend architecture.
- Prefer CSS, inline SVG icons, and existing verified assets.

## 9. Verification

- Existing country, catalogue, cart, contact, and backend tests continue to pass.
- Add targeted tests for removal of synthetic hero assets and continued presence of core actions/content.
- Check all five country modes, three languages, Arabic RTL, cart-enabled/disabled behavior, chat/human handoff, and admin role/country visibility.
- Capture desktop and mobile screenshots for the public site and key admin screens.
- Run the Impeccable mechanical detector once on changed web targets, then complete an independent finish review.

## 10. Delivery order

1. Public storefront redesign and verification.
2. Employee admin shell and high-frequency screens (dashboard, inbox, products, orders).
3. Remaining admin screens aligned to the new system.
4. Cross-surface verification, documentation, commit, push, and deployment only after the verified build is ready.

