-- users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'staff',
  status TEXT DEFAULT 'active',
  updated_at TEXT,
  created_at TEXT
);

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT
);

-- transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
  type TEXT,
  amount REAL,
  status TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);
