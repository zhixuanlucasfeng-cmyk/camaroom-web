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
