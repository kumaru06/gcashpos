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
  db.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, created_at TEXT)`).run()
  db.prepare(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, created_at TEXT)`).run()
  db.prepare(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT, customer_id INTEGER, customer_name TEXT, type TEXT, amount REAL, status TEXT, sync_status TEXT DEFAULT 'pending', created_at TEXT)`).run()
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

function addTransaction (tx) {
  if (!db) return null
  const stmt = db.prepare('INSERT OR IGNORE INTO transactions (transaction_id, customer_id, customer_name, type, amount, service_fee, status, sync_status, created_at) VALUES (@transaction_id, @customer_id, @customer_name, @type, @amount, @service_fee, @status, @sync_status, @created_at)')
  const info = stmt.run({
    transaction_id: tx.transaction_id || `txn_${Date.now()}`,
    customer_id: tx.customer_id || null,
    customer_name: tx.customer_name || null,
    type: tx.type || 'cash_in',
    amount: tx.amount || 0,
    service_fee: tx.service_fee || 0,
    status: tx.status || 'pending',
    sync_status: tx.sync_status || 'pending',
    created_at: tx.created_at || new Date().toISOString()
  })
  return { id: info.lastInsertRowid }
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

function createUser (username, password_hash) {
  if (!db) return null
  const stmt = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
  const info = stmt.run(username, password_hash, new Date().toISOString())
  return { id: info.lastInsertRowid }
}

function countUsers () {
  if (!db) return 0
  return db.prepare('SELECT COUNT(1) as c FROM users').get().c
}

module.exports = { initDatabase, getSummary, getTransactions, addTransaction, updateTransaction, deleteTransaction, deleteTestData, getUserByUsername, createUser, countUsers }

