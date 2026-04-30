const path = require('path')
const fs = require('fs')
let Database
try {
  Database = require('better-sqlite3')
} catch (err) {
  throw new Error('better-sqlite3 is required. Please install or rebuild native modules.')
}

let db

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
  try { db.prepare('ALTER TABLE users ADD COLUMN full_name TEXT').run() } catch(e){}
  try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'staff'").run() } catch(e){}
  try { db.prepare("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'").run() } catch(e){}
  try { db.prepare('ALTER TABLE users ADD COLUMN updated_at TEXT').run() } catch(e){}
  try { db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin'").run() } catch(e){}
  try { db.prepare("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''").run() } catch(e){}
  // Add customer_name column if upgrading from older DB
  try { db.prepare('ALTER TABLE transactions ADD COLUMN customer_name TEXT').run() } catch(e){}
  // Add service_fee column if upgrading from older DB
  try { db.prepare('ALTER TABLE transactions ADD COLUMN service_fee REAL DEFAULT 0').run() } catch(e){}
  // Ensure unique index on transaction_id (safe to run multiple times)
  try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_id ON transactions(transaction_id)').run() } catch(e){}
}

function getSummary () {
  if (!db) return {}
  const totalCashIn  = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = ? AND status = ?').get('cash_in',  'success').total
  const totalCashOut = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = ? AND status = ?').get('cash_out', 'success').total
  const totalSales   = totalCashIn
  const totalCustomers = db.prepare('SELECT COUNT(DISTINCT customer_id) as c FROM transactions').get().c
  // Use local time (not UTC) so dates match the user's timezone
  const now = new Date()
  const localYear  = now.getFullYear()
  const localMonth = String(now.getMonth() + 1).padStart(2, '0')
  const localDay   = String(now.getDate()).padStart(2, '0')
  const thisMonth  = `${localYear}-${localMonth}`
  const todayDate  = `${localYear}-${localMonth}-${localDay}`
  const salesThisMonth    = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE substr(created_at,1,7)=? AND type='cash_in'  AND status='success'").get(thisMonth).s
  const cashOutThisMonth  = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE substr(created_at,1,7)=? AND type='cash_out' AND status='success'").get(thisMonth).s
  const dailyCashIn       = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE substr(created_at,1,10)=? AND type='cash_in'  AND status='success'").get(todayDate).s
  const dailyCashOut      = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE substr(created_at,1,10)=? AND type='cash_out' AND status='success'").get(todayDate).s
  const dailyCashInCount  = db.prepare("SELECT COUNT(1) as c FROM transactions WHERE substr(created_at,1,10)=? AND type='cash_in'  AND status='success'").get(todayDate).c
  const dailyCashOutCount = db.prepare("SELECT COUNT(1) as c FROM transactions WHERE substr(created_at,1,10)=? AND type='cash_out' AND status='success'").get(todayDate).c
  const totalServiceFee   = db.prepare("SELECT COALESCE(SUM(service_fee),0) as s FROM transactions WHERE status='success'").get().s
  const serviceFeeThisMonth = db.prepare("SELECT COALESCE(SUM(service_fee),0) as s FROM transactions WHERE substr(created_at,1,7)=? AND status='success'").get(thisMonth).s
  const dailyServiceFee   = db.prepare("SELECT COALESCE(SUM(service_fee),0) as s FROM transactions WHERE substr(created_at,1,10)=? AND status='success'").get(todayDate).s
  return { totalSales, totalCashIn, totalCashOut, totalCustomers, salesThisMonth, cashOutThisMonth, dailyCashIn, dailyCashOut, dailyCashInCount, dailyCashOutCount, totalServiceFee, serviceFeeThisMonth, dailyServiceFee }
}

function getTransactions ({ page = 1, pageSize = 20, search = '' } = {}) {
  if (!db) return { rows: [], total: 0 }
  const offset = (page - 1) * pageSize
  const where = search ? `WHERE transaction_id LIKE @q OR status LIKE @q OR type LIKE @q` : ''
  const rows = db.prepare(`SELECT t.*, COALESCE(t.customer_name, c.name) as customer_name FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({ q: `%${search}%`, limit: pageSize, offset })
  const total = db.prepare(`SELECT COUNT(1) as cnt FROM transactions ${where}`).get({ q: `%${search}%` }).cnt
  return { rows, total }
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

function addTransaction (tx) {
  if (!db) return null
  const referenceNumber = String(tx.transaction_id || '').trim() || generateReferenceNumber()
  const duplicate = db.prepare('SELECT id FROM transactions WHERE transaction_id = ?').get(referenceNumber)
  if (duplicate) throw new Error('Reference number already exists')
  const stmt = db.prepare('INSERT INTO transactions (transaction_id, customer_id, customer_name, type, amount, service_fee, status, sync_status, created_at) VALUES (@transaction_id, @customer_id, @customer_name, @type, @amount, @service_fee, @status, @sync_status, @created_at)')
  const info = stmt.run({
    transaction_id: referenceNumber,
    customer_id: tx.customer_id || null,
    customer_name: tx.customer_name || null,
    type: tx.type || 'cash_in',
    amount: tx.amount || 0,
    service_fee: tx.service_fee || 0,
    status: tx.status || 'pending',
    sync_status: tx.sync_status || 'pending',
    created_at: tx.created_at || new Date().toISOString()
  })
  return { id: info.lastInsertRowid, transaction_id: referenceNumber }
}

function updateTransaction (id, updates) {
  if (!db) return null
  const keys = Object.keys(updates)
  if (keys.length === 0) return null
  const set = keys.map(k => `${k} = @${k}`).join(', ')
  const stmt = db.prepare(`UPDATE transactions SET ${set} WHERE id = @id`)
  const params = Object.assign({ id }, updates)
  const info = stmt.run(params)
  return { changes: info.changes }
}

function deleteTransaction (id) {
  if (!db) return null
  const stmt = db.prepare('DELETE FROM transactions WHERE id = ?')
  const info = stmt.run(id)
  return { changes: info.changes }
}

function deleteTestData () {
  if (!db) return { changes: 0 }
  const info = db.prepare("DELETE FROM transactions WHERE transaction_id LIKE 'TXN-TEST-%'").run()
  return { changes: info.changes }
}

// Users
function getUserByUsername (username) {
  if (!db) return null
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
}

function listUsers ({ search = '' } = {}) {
  if (!db) return []
  const where = search ? 'WHERE username LIKE @q OR full_name LIKE @q OR role LIKE @q OR status LIKE @q' : ''
  return db.prepare(`SELECT id, username, full_name, role, status, created_at, updated_at FROM users ${where} ORDER BY created_at DESC, id DESC`).all({ q: `%${search}%` })
}

function createUser (username, password_hash, opts = {}) {
  if (!db) return null
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const info = stmt.run(username, password_hash, opts.full_name || '', opts.role || 'staff', opts.status || 'active', now, now)
  return { id: info.lastInsertRowid }
}

function updateUser (id, updates) {
  if (!db) return null
  const row = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(id)
  if (!row) return { changes: 0 }
  const nextRole = Object.prototype.hasOwnProperty.call(updates, 'role') ? updates.role : row.role
  const nextStatus = Object.prototype.hasOwnProperty.call(updates, 'status') ? updates.status : row.status
  if ((row.role || '').toLowerCase() === 'admin' && ((nextRole || '').toLowerCase() !== 'admin' || (nextStatus || 'active').toLowerCase() !== 'active')) {
    const adminCount = db.prepare("SELECT COUNT(1) as c FROM users WHERE role = 'admin' AND status = 'active'").get().c
    if (adminCount <= 1) throw new Error('At least one active admin account is required')
  }
  const allowed = ['username', 'password_hash', 'full_name', 'role', 'status']
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

function deleteUser (id) {
  if (!db) return null
  const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id)
  if (!row) return { changes: 0 }
  if ((row.role || '').toLowerCase() === 'admin') {
    throw new Error('Administrator accounts cannot be deleted')
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return { changes: info.changes }
}

function countUsers () {
  if (!db) return 0
  return db.prepare('SELECT COUNT(1) as c FROM users').get().c
}

module.exports = { initDatabase, getSummary, getTransactions, addTransaction, updateTransaction, deleteTransaction, deleteTestData, getUserByUsername, listUsers, createUser, updateUser, deleteUser, countUsers }

