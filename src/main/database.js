const path = require('path')
const fs = require('fs')
let Database
try {
  Database = require('better-sqlite3')
} catch (err) {
  throw new Error('better-sqlite3 is required. Please install or rebuild native modules.')
}

let db

function requireOwner (ownerUsername) {
  const owner = String(ownerUsername || '').trim()
  if (!owner) throw new Error('No active shop owner session. Please login again.')
  return owner
}

async function initDatabase () {
  const { app } = require('electron')
  const dbPath = path.join(app.getPath('userData'), 'gcash-pos.db')
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, full_name TEXT, role TEXT DEFAULT 'staff', status TEXT DEFAULT 'active', updated_at TEXT, created_at TEXT)`).run()
  db.prepare(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, created_at TEXT)`).run()
  db.prepare(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT, customer_id INTEGER, customer_name TEXT, type TEXT, amount REAL, status TEXT, sync_status TEXT DEFAULT 'pending', created_at TEXT)`).run()
  // Add staff account columns if upgrading from older DB
  try { db.prepare('ALTER TABLE users ADD COLUMN full_name TEXT').run() } catch (e) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'staff'").run() } catch (e) {}
  try { db.prepare("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'").run() } catch (e) {}
  try { db.prepare('ALTER TABLE users ADD COLUMN updated_at TEXT').run() } catch (e) {}
  try { db.prepare('ALTER TABLE users ADD COLUMN cloud_synced INTEGER DEFAULT 0').run() } catch (e) {}
  try { db.prepare('ALTER TABLE users ADD COLUMN owner_username TEXT').run() } catch (e) {}
  try { db.prepare('ALTER TABLE users ADD COLUMN cloud_admin_id TEXT').run() } catch (e) {}
  try { db.prepare('ALTER TABLE users ADD COLUMN cloud_staff_id TEXT').run() } catch (e) {}
  // Per-admin data isolation
  try { db.prepare('ALTER TABLE transactions ADD COLUMN owner_username TEXT').run() } catch (e) {}
  try { db.prepare('ALTER TABLE customers ADD COLUMN owner_username TEXT').run() } catch (e) {}
  // Legacy default local admin is no longer used for Administrator login (cloud-managed).
  try { db.prepare("UPDATE users SET status = 'inactive' WHERE username = 'admin' AND IFNULL(cloud_synced, 0) = 0").run() } catch (e) {}
  try { db.prepare("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''").run() } catch (e) {}
  // Cloud admins own their own shop scope
  try { db.prepare("UPDATE users SET owner_username = username WHERE role = 'admin' AND (owner_username IS NULL OR owner_username = '')").run() } catch (e) {}
  // Add customer_name column if upgrading from older DB
  try { db.prepare('ALTER TABLE transactions ADD COLUMN customer_name TEXT').run() } catch (e) {}
  // Add service_fee column if upgrading from older DB
  try { db.prepare('ALTER TABLE transactions ADD COLUMN service_fee REAL DEFAULT 0').run() } catch (e) {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_txn_owner ON transactions(owner_username)').run() } catch (e) {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_users_owner ON users(owner_username)').run() } catch (e) {}
  // Reference uniqueness is per shop (not global across admins on one PC).
  try { db.prepare('DROP INDEX IF EXISTS idx_txn_id').run() } catch (e) {}
  try {
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_owner_ref ON transactions(owner_username, transaction_id)').run()
  } catch (e) {
    console.warn('Could not create per-shop unique index (duplicate refs may exist):', e && e.message)
  }
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS pending_cloud_deletes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_number TEXT NOT NULL,
      owner_username TEXT NOT NULL,
      created_at TEXT,
      UNIQUE(owner_username, reference_number)
    )`).run()
  } catch (e) {}
  try { migrateUsersUsernameScope() } catch (e) {
    console.warn('users username scope migration failed', e && e.message)
  }
  try { backfillCustomersFromTransactions() } catch (e) {}
}

/**
 * Allow same staff username across different shops on one PC.
 * Admins remain globally unique; staff unique per (owner_username, username).
 */
function migrateUsersUsernameScope () {
  if (!db) return
  const flag = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = '_meta_users_username_v2'
  `).get()
  if (flag) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS users_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password_hash TEXT,
      full_name TEXT,
      role TEXT DEFAULT 'staff',
      status TEXT DEFAULT 'active',
      updated_at TEXT,
      created_at TEXT,
      cloud_synced INTEGER DEFAULT 0,
      owner_username TEXT,
      cloud_admin_id TEXT,
      cloud_staff_id TEXT
    );
  `)

  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name)
  const want = ['id', 'username', 'password_hash', 'full_name', 'role', 'status', 'updated_at', 'created_at', 'cloud_synced', 'owner_username', 'cloud_admin_id', 'cloud_staff_id']
  const present = want.filter(c => cols.includes(c))
  if (present.length) {
    db.exec(`INSERT INTO users_v2 (${present.join(',')}) SELECT ${present.join(',')} FROM users`)
  }

  db.exec(`
    DROP TABLE users;
    ALTER TABLE users_v2 RENAME TO users;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_admin_username
      ON users(username) WHERE lower(IFNULL(role,'staff')) = 'admin';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_owner_username
      ON users(owner_username, username)
      WHERE lower(IFNULL(role,'staff')) = 'staff';
    CREATE INDEX IF NOT EXISTS idx_users_owner ON users(owner_username);
    CREATE TABLE IF NOT EXISTS _meta_users_username_v2 (ok INTEGER);
    INSERT INTO _meta_users_username_v2 (ok) VALUES (1);
  `)
}

function findOrCreateCustomer (ownerUsername, customerName) {
  if (!db) return null
  const owner = requireOwner(ownerUsername)
  const name = String(customerName || '').trim() || 'Walk-in'
  const existing = db.prepare(`
    SELECT id FROM customers
    WHERE owner_username = ? AND lower(trim(name)) = lower(trim(?))
    LIMIT 1
  `).get(owner, name)
  if (existing) return existing.id
  const info = db.prepare(`
    INSERT INTO customers (name, phone, created_at, owner_username)
    VALUES (?, NULL, ?, ?)
  `).run(name, new Date().toISOString(), owner)
  return info.lastInsertRowid
}

function backfillCustomersFromTransactions () {
  if (!db) return
  const rows = db.prepare(`
    SELECT DISTINCT owner_username, trim(customer_name) as customer_name
    FROM transactions
    WHERE owner_username IS NOT NULL
      AND trim(IFNULL(customer_name,'')) != ''
  `).all()
  for (const row of rows) {
    try { findOrCreateCustomer(row.owner_username, row.customer_name) } catch (e) {}
  }
  // Link transactions missing customer_id
  const orphans = db.prepare(`
    SELECT id, owner_username, customer_name FROM transactions
    WHERE customer_id IS NULL AND owner_username IS NOT NULL
  `).all()
  for (const row of orphans) {
    try {
      const cid = findOrCreateCustomer(row.owner_username, row.customer_name || 'Walk-in')
      if (cid) {
        db.prepare('UPDATE transactions SET customer_id = ? WHERE id = ?').run(cid, row.id)
      }
    } catch (e) {}
  }
}

function getActiveCloudAdmins () {
  if (!db) return []
  return db.prepare(`
    SELECT username FROM users
    WHERE lower(IFNULL(role, 'staff')) = 'admin'
      AND lower(IFNULL(status, 'active')) = 'active'
      AND IFNULL(cloud_synced, 0) = 1
    ORDER BY id ASC
  `).all()
}

// Intentionally do NOT auto-claim orphan staff to a logging-in admin.
// That caused cross-shop leaks on shared PCs. Staff must be created under an owner.
function claimOrphanShopData (ownerUsername) {
  if (!db) return { transactions: 0, customers: 0, staff: 0 }
  const owner = String(ownerUsername || '').trim()
  if (!owner) return { transactions: 0, customers: 0, staff: 0 }

  // Only auto-claim when a single cloud admin exists — avoids cross-shop leaks.
  const admins = getActiveCloudAdmins()
  if (admins.length > 1) return { transactions: 0, customers: 0, staff: 0 }

  const txInfo = db.prepare(`
    UPDATE transactions
    SET owner_username = ?
    WHERE owner_username IS NULL OR trim(owner_username) = ''
  `).run(owner)
  const custInfo = db.prepare(`
    UPDATE customers
    SET owner_username = ?
    WHERE owner_username IS NULL OR trim(owner_username) = ''
  `).run(owner)
  const staffInfo = db.prepare(`
    UPDATE users
    SET owner_username = ?, updated_at = ?
    WHERE (owner_username IS NULL OR trim(owner_username) = '')
      AND lower(IFNULL(role, 'staff')) = 'staff'
  `).run(owner, new Date().toISOString())

  return {
    transactions: txInfo.changes,
    customers: custInfo.changes,
    staff: staffInfo.changes
  }
}

function assignOrphanStaffToOwner (ownerUsername) {
  const result = claimOrphanShopData(ownerUsername)
  return { changes: result.staff || 0 }
}

function backfillOrphanStaffOwners () {
  return { changes: 0 }
}

function linkOrphanStaffUser () {
  return { changes: 0 }
}

function getSummary (ownerUsername) {
  if (!db) return {}
  const owner = requireOwner(ownerUsername)
  const totalCashIn = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE owner_username = ? AND type = ? AND status = ?').get(owner, 'cash_in', 'success').total
  const totalCashOut = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE owner_username = ? AND type = ? AND status = ?').get(owner, 'cash_out', 'success').total
  const totalSales = totalCashIn
  let totalCustomers = db.prepare(`
    SELECT COUNT(1) as c FROM customers WHERE owner_username = ?
  `).get(owner).c
  if (!totalCustomers) {
    totalCustomers = db.prepare(`
      SELECT COUNT(DISTINCT lower(trim(IFNULL(customer_name,'')))) as c
      FROM transactions
      WHERE owner_username = ? AND trim(IFNULL(customer_name,'')) != ''
    `).get(owner).c
  }

  // created_at is stored as UTC ISO — compare using local calendar day/month bounds.
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const dayStartIso = dayStart.toISOString()
  const dayEndIso = dayEnd.toISOString()
  const monthStartIso = monthStart.toISOString()
  const monthEndIso = monthEnd.toISOString()

  const salesThisMonth = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND type='cash_in'  AND status='success'").get(owner, monthStartIso, monthEndIso).s
  const cashOutThisMonth = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND type='cash_out' AND status='success'").get(owner, monthStartIso, monthEndIso).s
  const dailyCashIn = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND type='cash_in'  AND status='success'").get(owner, dayStartIso, dayEndIso).s
  const dailyCashOut = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND type='cash_out' AND status='success'").get(owner, dayStartIso, dayEndIso).s
  const dailyCashInCount = db.prepare("SELECT COUNT(1) as c FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND type='cash_in'  AND status='success'").get(owner, dayStartIso, dayEndIso).c
  const dailyCashOutCount = db.prepare("SELECT COUNT(1) as c FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND type='cash_out' AND status='success'").get(owner, dayStartIso, dayEndIso).c
  const totalServiceFee = db.prepare("SELECT COALESCE(SUM(service_fee),0) as s FROM transactions WHERE owner_username = ? AND status='success'").get(owner).s
  const serviceFeeThisMonth = db.prepare("SELECT COALESCE(SUM(service_fee),0) as s FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND status='success'").get(owner, monthStartIso, monthEndIso).s
  const dailyServiceFee = db.prepare("SELECT COALESCE(SUM(service_fee),0) as s FROM transactions WHERE owner_username = ? AND created_at >= ? AND created_at < ? AND status='success'").get(owner, dayStartIso, dayEndIso).s
  return { totalSales, totalCashIn, totalCashOut, totalCustomers, salesThisMonth, cashOutThisMonth, dailyCashIn, dailyCashOut, dailyCashInCount, dailyCashOutCount, totalServiceFee, serviceFeeThisMonth, dailyServiceFee, owner_username: owner }
}

function getTransactions ({ page = 1, pageSize = 20, search = '', ownerUsername } = {}) {
  if (!db) return { rows: [], total: 0 }
  const owner = requireOwner(ownerUsername)
  const offset = (page - 1) * pageSize
  const where = search
    ? 'WHERE t.owner_username = @owner AND (t.transaction_id LIKE @q OR t.status LIKE @q OR t.type LIKE @q OR COALESCE(t.customer_name, c.name) LIKE @q)'
    : 'WHERE t.owner_username = @owner'
  const rows = db.prepare(`SELECT t.*, COALESCE(t.customer_name, c.name) as customer_name FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id ${where} ORDER BY t.created_at DESC LIMIT @limit OFFSET @offset`).all({ owner, q: `%${search}%`, limit: pageSize, offset })
  const total = db.prepare(`SELECT COUNT(1) as cnt FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id ${where}`).get({ owner, q: `%${search}%` }).cnt
  return { rows, total, owner_username: owner }
}

function generateReferenceNumber () {
  if (!db) return `${Date.now()}`
  for (let i = 0; i < 25; i++) {
    const ref = `${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`
    const exists = db.prepare('SELECT 1 FROM transactions WHERE transaction_id = ?').get(ref)
    if (!exists) return ref
  }
  throw new Error('Unable to generate unique reference number')
}

function addTransaction (tx, ownerUsername) {
  if (!db) return null
  const owner = requireOwner(ownerUsername || tx.owner_username)
  const referenceNumber = String(tx.transaction_id || '').trim() || generateReferenceNumber()
  const duplicate = db.prepare(
    'SELECT id FROM transactions WHERE transaction_id = ? AND owner_username = ?'
  ).get(referenceNumber, owner)
  if (duplicate) throw new Error('Reference number already exists')

  const type = String(tx.type || 'cash_in').toLowerCase()
  if (type !== 'cash_in' && type !== 'cash_out') {
    throw new Error('Type must be cash_in or cash_out')
  }
  const amount = Number(tx.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  const serviceFee = Number(tx.service_fee || 0)
  if (!Number.isFinite(serviceFee) || serviceFee < 0) {
    throw new Error('Service fee cannot be negative')
  }
  const status = String(tx.status || 'pending').toLowerCase()
  const allowedStatus = ['success', 'pending', 'failed', 'cancelled']
  if (!allowedStatus.includes(status)) {
    throw new Error('Invalid transaction status')
  }

  const customerId = tx.customer_id || findOrCreateCustomer(owner, tx.customer_name || 'Walk-in')
  const stmt = db.prepare('INSERT INTO transactions (transaction_id, customer_id, customer_name, type, amount, service_fee, status, sync_status, created_at, owner_username) VALUES (@transaction_id, @customer_id, @customer_name, @type, @amount, @service_fee, @status, @sync_status, @created_at, @owner_username)')
  const info = stmt.run({
    transaction_id: referenceNumber,
    customer_id: customerId,
    customer_name: tx.customer_name || 'Walk-in',
    type,
    amount,
    service_fee: serviceFee,
    status,
    sync_status: tx.sync_status || 'pending',
    created_at: tx.created_at || new Date().toISOString(),
    owner_username: owner
  })
  return { id: info.lastInsertRowid, transaction_id: referenceNumber, owner_username: owner, customer_id: customerId }
}

const TX_UPDATE_ALLOWLIST = new Set([
  'customer_name',
  'customer_id',
  'type',
  'amount',
  'service_fee',
  'status',
  'sync_status',
  'transaction_id'
])

const TX_MONEY_FIELDS = new Set(['amount', 'service_fee', 'type', 'transaction_id'])

function sanitizeTransactionUpdates (updates = {}) {
  const safe = {}
  for (const [key, value] of Object.entries(updates || {})) {
    if (!TX_UPDATE_ALLOWLIST.has(key)) continue
    safe[key] = value
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'type')) {
    const type = String(safe.type || '').toLowerCase()
    if (type !== 'cash_in' && type !== 'cash_out') {
      throw new Error('Type must be cash_in or cash_out')
    }
    safe.type = type
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'amount')) {
    const amount = Number(safe.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }
    safe.amount = amount
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'service_fee')) {
    const fee = Number(safe.service_fee)
    if (!Number.isFinite(fee) || fee < 0) {
      throw new Error('Service fee cannot be negative')
    }
    safe.service_fee = fee
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'status')) {
    const status = String(safe.status || '').toLowerCase()
    const allowedStatus = ['success', 'pending', 'failed', 'cancelled']
    if (!allowedStatus.includes(status)) {
      throw new Error('Invalid transaction status')
    }
    safe.status = status
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'sync_status')) {
    const syncStatus = String(safe.sync_status || '').toLowerCase()
    const allowedSync = ['pending', 'synced', 'conflict', 'failed']
    if (!allowedSync.includes(syncStatus)) {
      throw new Error('Invalid sync status')
    }
    safe.sync_status = syncStatus
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'transaction_id')) {
    const ref = String(safe.transaction_id || '').trim()
    if (!ref) throw new Error('Reference number is required')
    safe.transaction_id = ref
  }
  return safe
}

function updatesTouchMoneyFields (updates = {}) {
  return Object.keys(updates || {}).some(k => TX_MONEY_FIELDS.has(k))
}

function updateTransaction (id, updates, ownerUsername) {
  if (!db) return null
  const owner = requireOwner(ownerUsername)
  const owned = db.prepare('SELECT id FROM transactions WHERE id = ? AND owner_username = ?').get(id, owner)
  if (!owned) return { changes: 0, error: 'Transaction not found for this shop' }
  const safe = sanitizeTransactionUpdates(updates)
  const keys = Object.keys(safe)
  if (keys.length === 0) return { changes: 0, error: 'No valid fields to update' }

  if (Object.prototype.hasOwnProperty.call(safe, 'transaction_id')) {
    const dup = db.prepare(
      'SELECT id FROM transactions WHERE transaction_id = ? AND owner_username = ? AND id != ?'
    ).get(safe.transaction_id, owner, id)
    if (dup) throw new Error('Reference number already exists')
  }

  const set = keys.map(k => `${k} = @${k}`).join(', ')
  const stmt = db.prepare(`UPDATE transactions SET ${set} WHERE id = @id AND owner_username = @owner_username`)
  const info = stmt.run(Object.assign({ id, owner_username: owner }, safe))
  return { changes: info.changes }
}

function getTransactionById (id, ownerUsername) {
  if (!db) return null
  const owner = requireOwner(ownerUsername)
  return db.prepare(
    'SELECT * FROM transactions WHERE id = ? AND owner_username = ?'
  ).get(id, owner) || null
}

function queueCloudDelete (referenceNumber, ownerUsername) {
  if (!db) return { changes: 0 }
  const owner = requireOwner(ownerUsername)
  const ref = String(referenceNumber || '').trim()
  if (!ref) return { changes: 0 }
  const info = db.prepare(`
    INSERT OR IGNORE INTO pending_cloud_deletes (reference_number, owner_username, created_at)
    VALUES (?, ?, ?)
  `).run(ref, owner, new Date().toISOString())
  return { changes: info.changes }
}

function getPendingCloudDeletes (ownerUsername, limit = 100) {
  if (!db) return []
  const owner = requireOwner(ownerUsername)
  const lim = Math.max(1, Math.min(Number(limit) || 100, 200))
  return db.prepare(`
    SELECT * FROM pending_cloud_deletes
    WHERE owner_username = ?
    ORDER BY id ASC
    LIMIT ?
  `).all(owner, lim)
}

function clearPendingCloudDelete (id, ownerUsername) {
  if (!db) return { changes: 0 }
  const owner = requireOwner(ownerUsername)
  const info = db.prepare(
    'DELETE FROM pending_cloud_deletes WHERE id = ? AND owner_username = ?'
  ).run(id, owner)
  return { changes: info.changes }
}

function deleteTransaction (id, ownerUsername) {
  if (!db) return null
  const owner = requireOwner(ownerUsername)
  const row = getTransactionById(id, owner)
  if (!row) return { changes: 0, error: 'Transaction not found for this shop' }
  const info = db.prepare('DELETE FROM transactions WHERE id = ? AND owner_username = ?').run(id, owner)
  // Always queue cloud delete so web stays consistent even if offline now.
  if (row.transaction_id) {
    try { queueCloudDelete(row.transaction_id, owner) } catch (e) {}
  }
  return {
    changes: info.changes,
    reference_number: row.transaction_id || null,
    queued_cloud_delete: true
  }
}

function deleteTestData (ownerUsername) {
  if (!db) return { changes: 0 }
  const owner = requireOwner(ownerUsername)
  const info = db.prepare("DELETE FROM transactions WHERE owner_username = ? AND transaction_id LIKE 'TXN-TEST-%'").run(owner)
  return { changes: info.changes }
}

// Users
function getUserByUsername (username, { role = null, ownerUsername = null } = {}) {
  if (!db) return null
  const uname = String(username || '').trim()
  if (!uname) return null
  if (ownerUsername) {
    return db.prepare(`
      SELECT * FROM users
      WHERE lower(username) = lower(?)
        AND owner_username = ?
      LIMIT 1
    `).get(uname, ownerUsername) || null
  }
  if (role) {
    return db.prepare(`
      SELECT * FROM users
      WHERE lower(username) = lower(?)
        AND lower(IFNULL(role,'staff')) = lower(?)
      LIMIT 1
    `).get(uname, role) || null
  }
  // Prefer exact match; if multiple staff across shops, caller should disambiguate.
  const rows = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').all(uname)
  if (!rows.length) return null
  if (rows.length === 1) return rows[0]
  const admin = rows.find(r => String(r.role || '').toLowerCase() === 'admin')
  return admin || rows[0]
}

function listUsersByUsername (username, { role = null } = {}) {
  if (!db) return []
  const uname = String(username || '').trim()
  if (!uname) return []
  if (role) {
    return db.prepare(`
      SELECT * FROM users
      WHERE lower(username) = lower(?)
        AND lower(IFNULL(role,'staff')) = lower(?)
    `).all(uname, role)
  }
  return db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').all(uname)
}

function getUserById (id, ownerUsername = null) {
  if (!db) return null
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!row) return null
  if (ownerUsername) {
    const owner = requireOwner(ownerUsername)
    if (String(row.owner_username || '') !== owner) return null
  }
  return row
}

function listUsers ({ search = '', ownerUsername, staffOnly = true } = {}) {
  if (!db) return []
  const owner = requireOwner(ownerUsername)
  const clauses = ['owner_username = @owner']
  if (staffOnly) clauses.push("LOWER(IFNULL(role,'staff')) = 'staff'")
  if (search) clauses.push('(username LIKE @q OR full_name LIKE @q OR role LIKE @q OR status LIKE @q)')
  const where = `WHERE ${clauses.join(' AND ')}`
  return db.prepare(`SELECT id, username, full_name, role, status, owner_username, created_at, updated_at FROM users ${where} ORDER BY created_at DESC, id DESC`).all({ owner, q: `%${search}%` })
}

function assertUsernameAvailable (username, { ownerUsername = null, role = 'staff', excludeId = null } = {}) {
  if (!db) return
  const uname = String(username || '').trim()
  if (!uname) throw new Error('Username is required')
  const isAdminRole = (role || '').toLowerCase() === 'admin'

  if (isAdminRole || !ownerUsername) {
    let sql = 'SELECT id FROM users WHERE lower(username) = lower(?)'
    const params = [uname]
    if (excludeId) { sql += ' AND id != ?'; params.push(excludeId) }
    if (db.prepare(sql).get(...params)) {
      throw new Error('Username already exists. Choose a different username.')
    }
    return
  }

  let staffSql = 'SELECT id FROM users WHERE lower(username) = lower(?) AND owner_username = ?'
  const staffParams = [uname, ownerUsername]
  if (excludeId) { staffSql += ' AND id != ?'; staffParams.push(excludeId) }
  if (db.prepare(staffSql).get(...staffParams)) {
    throw new Error('Username already exists for this shop. Choose a different username.')
  }

  const adminHit = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND lower(IFNULL(role,'staff')) = 'admin'").get(uname)
  if (adminHit && adminHit.id !== excludeId) {
    throw new Error('Username already exists. Choose a different username.')
  }
}

function createUser (username, password_hash, opts = {}) {
  if (!db) return null
  const now = new Date().toISOString()
  const owner = opts.owner_username || null
  const role = opts.role || 'staff'
  assertUsernameAvailable(username, { ownerUsername: owner, role })
  const stmt = db.prepare('INSERT INTO users (username, password_hash, full_name, role, status, owner_username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const info = stmt.run(username, password_hash, opts.full_name || '', opts.role || 'staff', opts.status || 'active', owner, now, now)
  return { id: info.lastInsertRowid }
}

function updateUser (id, updates, ownerUsername = null) {
  if (!db) return null
  const row = db.prepare('SELECT id, role, status, owner_username, username FROM users WHERE id = ?').get(id)
  if (!row) return { changes: 0 }
  if (ownerUsername) {
    const owner = requireOwner(ownerUsername)
    if (String(row.owner_username || '') !== owner) {
      throw new Error('Staff account not found for this shop')
    }
  }
  const nextRole = Object.prototype.hasOwnProperty.call(updates, 'role') ? updates.role : row.role
  const nextStatus = Object.prototype.hasOwnProperty.call(updates, 'status') ? updates.status : row.status
  if (Object.prototype.hasOwnProperty.call(updates, 'username') && updates.username !== row.username) {
    assertUsernameAvailable(updates.username, {
      ownerUsername: row.owner_username,
      role: nextRole,
      excludeId: id
    })
  }
  if ((row.role || '').toLowerCase() === 'admin' && ((nextRole || '').toLowerCase() !== 'admin' || (nextStatus || 'active').toLowerCase() !== 'active')) {
    const adminCount = db.prepare("SELECT COUNT(1) as c FROM users WHERE role = 'admin' AND status = 'active'").get().c
    if (adminCount <= 1) throw new Error('At least one active admin account is required')
  }
  const allowed = ['username', 'password_hash', 'full_name', 'role', 'status', 'cloud_synced', 'owner_username', 'cloud_admin_id', 'cloud_staff_id']
  const patch = {}
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) patch[key] = updates[key]
  })
  if (Object.keys(patch).length === 0) return { changes: 0 }
  patch.updated_at = new Date().toISOString()
  const set = Object.keys(patch).map(k => `${k} = @${k}`).join(', ')
  const info = db.prepare(`UPDATE users SET ${set} WHERE id = @id`).run(Object.assign({ id }, patch))
  return { changes: info.changes }
}

function deleteUser (id, ownerUsername = null) {
  if (!db) return null
  const row = db.prepare('SELECT id, role, owner_username FROM users WHERE id = ?').get(id)
  if (!row) return { changes: 0 }
  if ((row.role || '').toLowerCase() === 'admin') {
    throw new Error('Administrator accounts cannot be deleted')
  }
  if (ownerUsername) {
    const owner = requireOwner(ownerUsername)
    if (String(row.owner_username || '') !== owner) {
      throw new Error('Staff account not found for this shop')
    }
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return { changes: info.changes }
}

function countUsers () {
  if (!db) return 0
  return db.prepare('SELECT COUNT(1) as c FROM users').get().c
}

function countTransactionsForOwner (ownerUsername) {
  if (!db) return 0
  const owner = String(ownerUsername || '').trim()
  if (!owner) return 0
  return db.prepare('SELECT COUNT(1) as c FROM transactions WHERE owner_username = ?').get(owner).c
}

function hasTransactionsBefore (ownerUsername, isoDate) {
  if (!db || !isoDate) return false
  const owner = String(ownerUsername || '').trim()
  if (!owner) return false
  const row = db.prepare(`
    SELECT COUNT(1) as c FROM transactions
    WHERE owner_username = ? AND created_at < ?
  `).get(owner, isoDate)
  return (row && row.c > 0)
}

function purgeShopData (ownerUsername) {
  if (!db) return { transactions: 0, customers: 0, staff: 0 }
  const owner = String(ownerUsername || '').trim()
  if (!owner) return { transactions: 0, customers: 0, staff: 0 }

  const txInfo = db.prepare('DELETE FROM transactions WHERE owner_username = ?').run(owner)
  const custInfo = db.prepare('DELETE FROM customers WHERE owner_username = ?').run(owner)
  const staffInfo = db.prepare(`
    DELETE FROM users
    WHERE owner_username = ?
      AND lower(IFNULL(role, 'staff')) = 'staff'
  `).run(owner)

  return {
    transactions: txInfo.changes,
    customers: custInfo.changes,
    staff: staffInfo.changes
  }
}

function deactivateCloudAdmin (username) {
  if (!db) return { changes: 0 }
  const info = db.prepare(`
    UPDATE users
    SET status = 'inactive', updated_at = ?
    WHERE lower(username) = lower(?)
      AND lower(IFNULL(role, 'staff')) = 'admin'
      AND IFNULL(cloud_synced, 0) = 1
  `).run(new Date().toISOString(), username)
  return { changes: info.changes }
}

function purgeCloudAdmin (username) {
  if (!db) return { changes: 0 }
  const info = db.prepare(`
    DELETE FROM users
    WHERE lower(username) = lower(?)
      AND lower(IFNULL(role, 'staff')) = 'admin'
      AND IFNULL(cloud_synced, 0) = 1
  `).run(username)
  return { changes: info.changes }
}

function deactivateLegacyLocalAdmin (exceptUsername = '') {
  if (!db) return { changes: 0 }
  const info = db.prepare(`
    UPDATE users
    SET status = 'inactive', updated_at = ?
    WHERE username = 'admin'
      AND IFNULL(cloud_synced, 0) = 0
      AND username != ?
  `).run(new Date().toISOString(), exceptUsername || '')
  return { changes: info.changes }
}

function getPendingTransactions (ownerUsername, limit = 200) {
  if (!db) return []
  const owner = requireOwner(ownerUsername)
  const lim = Math.max(1, Math.min(1000, Number(limit) || 200))
  return db.prepare(`
    SELECT * FROM transactions
    WHERE owner_username = ?
      AND IFNULL(sync_status, 'pending') = 'pending'
    ORDER BY id ASC
    LIMIT ?
  `).all(owner, lim)
}

function purgeLegacyLocalAdmin () {
  if (!db) return { changes: 0 }
  const info = db.prepare(`
    DELETE FROM users
    WHERE username = 'admin'
      AND IFNULL(cloud_synced, 0) = 0
  `).run()
  return { changes: info.changes }
}

module.exports = {
  initDatabase,
  getSummary,
  getTransactions,
  getPendingTransactions,
  getTransactionById,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  deleteTestData,
  queueCloudDelete,
  getPendingCloudDeletes,
  clearPendingCloudDelete,
  updatesTouchMoneyFields,
  sanitizeTransactionUpdates,
  getUserByUsername,
  listUsersByUsername,
  getUserById,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  countUsers,
  deactivateLegacyLocalAdmin,
  purgeLegacyLocalAdmin,
  deactivateCloudAdmin,
  assertUsernameAvailable,
  assignOrphanStaffToOwner,
  backfillOrphanStaffOwners,
  linkOrphanStaffUser,
  claimOrphanShopData,
  findOrCreateCustomer,
  purgeCloudAdmin,
  purgeShopData,
  countTransactionsForOwner,
  hasTransactionsBefore
}
