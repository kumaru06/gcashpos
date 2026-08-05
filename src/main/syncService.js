const db = require('./database')
const api = require('./apiClient')
const presenceService = require('./presenceService')

// Sync status and control
let lastStatus = { online: false, internet: false, api: false, synced: false, lastRun: null, message: 'idle' }
let autoSyncInterval = null
let sessionCheckInterval = null
let isSyncing = false
let wasOnline = null
let lastSessionCheckAt = 0

// Connectivity UI polls every ~3s — do NOT enforce auth that often.
const SESSION_CHECK_MIN_INTERVAL_MS = 2 * 60 * 1000

async function isOnline () {
  return api.isOnline()
}

async function refreshConnectionStatus ({ checkSession = false } = {}) {
  // API reachability is the source of truth for sync (works on local Laragon).
  const apiUp = await api.isApiOnline()
  const internet = apiUp ? true : await api.isInternetOnline()
  const online = !!apiUp

  let sessionCheck = { valid: true }
  // Only when explicitly requested (periodic interval / forceSync).
  // Do NOT use "due" here — UI getStatus() every 3s would still kick auth.
  if (online && checkSession) {
    lastSessionCheckAt = Date.now()
    try {
      sessionCheck = await require('./authService').enforceCloudSessionOrLogout()
    } catch (e) {}
  }

  // When we drop offline, try to mark presence offline (keep token for reconnect).
  if (wasOnline === true && online === false) {
    try {
      const auth = require('./authService')
      if (!auth.isAuthBusy()) {
        await presenceService.stop({ notifyOffline: true, clearToken: false })
      }
    } catch (e) {}
  }
  // When we come back online, resume heartbeat session.
  if (wasOnline === false && online === true) {
    try {
      if (presenceService.getToken()) await presenceService.resumeIfPossible()
      else await presenceService.pulseIfLoggedIn()
    } catch (e) {}
  }
  wasOnline = online

  let cloudSyncReady = false
  let softDegraded = false
  try {
    const auth = require('./authService')
    cloudSyncReady = !!auth.getApiToken()
    softDegraded = !!(auth.isCloudSoftDegraded && auth.isCloudSoftDegraded())
    // Token restored (e.g. shop sync token) — clear stale soft-degrade flag.
    if (cloudSyncReady && softDegraded && auth.clearSoftDegradedFlag) {
      auth.clearSoftDegradedFlag()
      softDegraded = false
    }
  } catch (e) {}

  lastStatus = {
    ...lastStatus,
    online,
    internet,
    api: apiUp,
    cloudSyncReady,
    softDegraded,
    message: online ? 'online' : 'offline',
    lastRun: new Date().toISOString(),
    sessionRevoked: sessionCheck.valid === false
      ? { reason: sessionCheck.reason, message: sessionCheck.message }
      : null
  }
  return lastStatus
}

// Laravel TransactionSyncController validates max 200 items per request.
const API_SYNC_BATCH_SIZE = 200

async function processPendingDeletes (auth, ownerUsername, token, status) {
  let deleted = 0
  const pendingDeletes = db.getPendingCloudDeletes(ownerUsername, 100)
  for (const row of pendingDeletes) {
    try {
      await api.deleteTransaction(token, row.reference_number)
      db.clearPendingCloudDelete(row.id, ownerUsername)
      deleted += 1
    } catch (err) {
      if (auth.isAuthFailure && auth.isAuthFailure(err)) {
        try { await auth.handleAuthFailureFromApi(err, token) } catch (e) {}
        throw err
      }
      // 404-style already-gone is handled as success by API; other errors retry later.
      console.warn('Cloud delete failed', row.reference_number, err && err.message)
    }
  }
  return deleted
}

async function processQueue ({ limit = API_SYNC_BATCH_SIZE } = {}) {
  if (isSyncing) return { synced: 0, syncedIds: [] }
  isSyncing = true
  lastStatus = { ...lastStatus, synced: false, lastRun: new Date().toISOString(), message: 'syncing' }
  let synced = 0
  let failed = 0
  let deletedCount = 0
  const syncedIds = []
  try {
    const auth = require('./authService')
    let ownerUsername = null
    try {
      ownerUsername = auth.getOwnerUsername()
    } catch (e) {}
    if (!ownerUsername) {
      lastStatus = { ...lastStatus, synced: false, syncedIds: [], lastRun: new Date().toISOString(), message: 'no-owner-session' }
      return lastStatus
    }

    const status = await refreshConnectionStatus({ checkSession: false })
    if (!status.online) {
      lastStatus = {
        ...status,
        synced: false,
        syncedCount: 0,
        syncedIds: [],
        pendingCount: db.getPendingTransactions(ownerUsername, Math.min(limit, API_SYNC_BATCH_SIZE)).length,
        message: 'offline'
      }
      return lastStatus
    }

    const token = auth.getApiToken()
    if (!token) {
      const pending = db.getPendingTransactions(ownerUsername, Math.min(limit, API_SYNC_BATCH_SIZE))
      lastStatus = {
        ...status,
        synced: false,
        syncedCount: 0,
        syncedIds: [],
        pendingCount: pending.length,
        message: 'no-cloud-token'
      }
      return lastStatus
    }

    try {
      deletedCount = await processPendingDeletes(auth, ownerUsername, token, status)
    } catch (err) {
      lastStatus = {
        ...status,
        synced: false,
        syncedCount: 0,
        syncedIds: [],
        deletedCount,
        message: 'sync-failed',
        error: err && err.message
      }
      return lastStatus
    }

    let remainingToProcess = Math.max(1, Number(limit) || API_SYNC_BATCH_SIZE)
    let lastPendingCount = 0

    while (remainingToProcess > 0) {
      const batchLimit = Math.min(API_SYNC_BATCH_SIZE, remainingToProcess)
      const pending = db.getPendingTransactions(ownerUsername, batchLimit)
      lastPendingCount = pending.length
      if (!pending.length) break

      const payload = pending.map(row => ({
        local_id: row.id,
        reference_number: row.transaction_id,
        customer_name: row.customer_name || null,
        type: row.type || 'cash_in',
        amount: Number(row.amount) || 0,
        service_fee: Number(row.service_fee) || 0,
        status: row.status || 'success',
        transacted_at: row.created_at || null
      }))

      let result
      try {
        result = await api.syncTransactions(token, payload)
      } catch (err) {
        if (auth.isAuthFailure && auth.isAuthFailure(err)) {
          try { await auth.handleAuthFailureFromApi(err, token) } catch (e) {}
        }
        console.error('Transaction sync upload failed', err && err.message)
        lastStatus = {
          ...status,
          synced: synced > 0,
          syncedCount: synced,
          syncedIds,
          failedCount: failed,
          deletedCount,
          pendingCount: pending.length,
          message: 'sync-failed',
          error: err && err.message
        }
        return lastStatus
      }

      const syncedRows = (result && result.synced) || []
      for (const item of syncedRows) {
        const localId = item && item.local_id
        if (localId == null) continue
        try {
          await db.updateTransaction(localId, { sync_status: 'synced' }, ownerUsername)
          synced += 1
          syncedIds.push(localId)
        } catch (e) {
          failed += 1
          console.warn('Failed to mark local tx synced', localId, e && e.message)
        }
      }

      const failedRows = (result && result.failed) || []
      failed += failedRows.length
      for (const item of failedRows) {
        console.warn('Cloud rejected tx', item && item.reference_number, item && item.error)
        if (item && item.local_id != null) {
          try {
            await db.updateTransaction(item.local_id, { sync_status: 'failed' }, ownerUsername)
          } catch (e) {}
        }
      }

      remainingToProcess -= pending.length
      // Avoid infinite loop if cloud keeps rejecting the same rows.
      if (syncedRows.length === 0 && failedRows.length > 0) break
      if (pending.length < batchLimit) break
    }

    if (synced === 0 && failed === 0 && lastPendingCount === 0) {
      lastStatus = {
        ...status,
        synced: true,
        syncedCount: 0,
        syncedIds: [],
        deletedCount,
        pendingCount: 0,
        message: deletedCount > 0 ? 'up-to-date' : 'up-to-date'
      }
      return lastStatus
    }

    const remaining = db.getPendingTransactions(ownerUsername, API_SYNC_BATCH_SIZE).length
    lastStatus = {
      ...status,
      synced: synced > 0 || deletedCount > 0,
      syncedCount: synced,
      syncedIds,
      failedCount: failed,
      deletedCount,
      pendingCount: remaining,
      message: remaining === 0 ? 'up-to-date' : 'partial'
    }
    return lastStatus
  } finally {
    isSyncing = false
  }
}

async function handleConflict (localTx, remoteData) {
  try {
    let ownerUsername = null
    try { ownerUsername = require('./authService').getOwnerUsername() } catch (e) {}
    await db.updateTransaction(localTx.id, { sync_status: 'conflict' }, ownerUsername)
    console.warn('Conflict for tx', localTx.id)
  } catch (err) {
    console.error('Conflict handling failed', err.message)
  }
}

async function getStatus () {
  // Used by UI every 3s — connectivity badge only.
  return refreshConnectionStatus({ checkSession: false })
}

async function forceSync () {
  const status = await refreshConnectionStatus({ checkSession: true })
  if (!status.online) {
    return status
  }
  return await processQueue({ limit: 1000 })
}

function startAutoSync (intervalMs = 10 * 1000) {
  if (autoSyncInterval) return
  autoSyncInterval = setInterval(async () => {
    try {
      const status = await refreshConnectionStatus({ checkSession: false })
      if (status.online) await processQueue({ limit: 200 })
    } catch (err) {
      console.error('Auto-sync error', err.message)
    }
  }, intervalMs)

  if (!sessionCheckInterval) {
    sessionCheckInterval = setInterval(async () => {
      try {
        await refreshConnectionStatus({ checkSession: true })
      } catch (err) {
        console.error('Session check error', err.message)
      }
    }, SESSION_CHECK_MIN_INTERVAL_MS)
  }
}

function stopAutoSync () {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval)
    autoSyncInterval = null
  }
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval)
    sessionCheckInterval = null
  }
}

async function startSyncNow () {
  const status = await refreshConnectionStatus({ checkSession: false })
  if (!status.online) return { synced: 0, message: 'offline', online: false }
  return processQueue({ limit: 1000 })
}

module.exports = {
  getStatus,
  forceSync,
  startSyncNow,
  startAutoSync,
  stopAutoSync,
  isOnline,
  refreshConnectionStatus
}
