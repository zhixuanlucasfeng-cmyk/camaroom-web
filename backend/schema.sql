CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  quoted_price INTEGER,
  payment_link TEXT,
  flutterwave_tx_ref TEXT,
  paid_at TEXT
);
