-- status moves forward through SHIPMENT_STAGES (src/shipments.js) as sales
-- updates it by hand — there is no carrier API integration, this is a
-- manually-maintained record of "which container is this order's stock in
-- and how far along is it."
CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  quoted_price INTEGER,
  paid_at TEXT,
  shipment_id TEXT REFERENCES shipments(id)
);

CREATE TABLE inventory (
  sku TEXT PRIMARY KEY,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Sales rep roster + session-consistent random assignment. Empty/unused on
-- Cameroon's deployment — this is Mali-specific config data seeded via
-- scripts/seed_mali_sales_reps.sql after deploy, not a shared feature.
CREATE TABLE sales_reps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- One row per browser session: first touchpoint (source) picks a random
-- active rep and pins it here, so every later WhatsApp click or order
-- submission in the same session reuses the same rep instead of reassigning.
-- order_id is filled in when/if that session's assignment later places an
-- order — the record of "which rep was this customer routed to" survives
-- independently of whether they ever complete a purchase.
CREATE TABLE rep_assignments (
  session_id TEXT PRIMARY KEY,
  rep_id TEXT NOT NULL REFERENCES sales_reps(id),
  source TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
