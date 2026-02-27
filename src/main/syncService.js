const axios = require('axios')
const db = require('./database')

// Sync status and control
let lastStatus = { synced: false, lastRun: null, message: 'idle' }
let autoSyncInterval = null
let isSyncing = false

// Simple online check (ping remote or try DNS resolve)
async function isOnline () {
  try {
    // lightweight GET to known endpoint; replace with your health/ping route
    await axios.get('https://api.example.com/health', { timeout: 3000 })
    return true
  } catch (err) {
    return false
  }
}

async function processQueue ({ limit = 200 } = {}) {
  if (isSyncing) return { synced: 0 }
  isSyncing = true
  lastStatus = { synced: false, lastRun: new Date().toISOString(), message: 'syncing' }
  let synced = 0
  try {
    const pending = (await db.getTransactions({ page: 1, pageSize: limit })).rows.filter(r => r.sync_status === 'pending')
    for (const tx of pending) {
      try {
        // POST to remote sync endpoint - real implementation should map fields and handle auth
        const resp = await axios.post('https://api.example.com/sync/transactions', tx, { timeout: 10000 })
        if (resp && (resp.status === 200 || resp.status === 201)) {
          await db.updateTransaction(tx.id, { sync_status: 'synced' })
          synced++
        } else if (resp && resp.status === 409) {
          // conflict handling placeholder
          await handleConflict(tx, resp.data)
        }
      } catch (err) {
        // network or server error -> leave pending for next attempt
        console.error('Sync error for', tx.id, err.message)
      }
    }
    lastStatus = { synced: synced > 0, lastRun: new Date().toISOString(), message: 'ok', syncedCount: synced }
    return lastStatus
  } finally {
    isSyncing = false
  }
}

async function handleConflict (localTx, remoteData) {
  // Placeholder conflict strategy: prefer remote; mark local as conflict and record for review
  try {
    await db.updateTransaction(localTx.id, { sync_status: 'conflict' })
    console.warn('Conflict for tx', localTx.id)
  } catch (err) {
    console.error('Conflict handling failed', err.message)
  }
}

async function getStatus () {
  return lastStatus
}

async function forceSync () {
  const online = await isOnline()
  if (!online) {
    lastStatus = { synced: false, lastRun: new Date().toISOString(), message: 'offline' }
    return lastStatus
  }
  return await processQueue({ limit: 1000 })
}

function startAutoSync (intervalMs = 30 * 1000) {
  if (autoSyncInterval) return
  autoSyncInterval = setInterval(async () => {
    try {
      const online = await isOnline()
      if (online) await processQueue({ limit: 200 })
    } catch (err) {
      console.error('Auto-sync error', err.message)
    }
  }, intervalMs)
}

function stopAutoSync () {
  if (!autoSyncInterval) return
  clearInterval(autoSyncInterval)
  autoSyncInterval = null
}

// convenience: immediate one-shot sync
async function startSyncNow () {
  const online = await isOnline()
  if (!online) return { synced: 0, message: 'offline' }
  const res = await processQueue({ limit: 1000 })
  return res
}

module.exports = { getStatus, forceSync, startSyncNow, startAutoSync, stopAutoSync }
