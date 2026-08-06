const Store = require('electron-store')
const bcrypt = require('bcryptjs')
const db = require('./database')
const api = require('./apiClient')
const presenceService = require('./presenceService')
const { SESSION_MIN_TTL_MS } = require('../config/constants')

const sessionStore = new Store({ name: 'gcashpos-session' })

let onSessionRevoked = null
let revokingSession = false
let loginChain = Promise.resolve()
let loginGeneration = 0
let authBusyUntil = 0

function setSessionRevokedHandler (fn) {
  onSessionRevoked = typeof fn === 'function' ? fn : null
}

function getStoredApiToken () {
  return sessionStore.get('apiToken') || null
}

function setCloudSyncCredentials (ownerUsername, token) {
  const owner = String(ownerUsername || '').trim()
  if (!owner || !token) return
  sessionStore.set('cloudSyncOwner', owner)
  sessionStore.set('cloudSyncToken', token)
}

function clearCloudSyncCredentials () {
  sessionStore.delete('cloudSyncOwner')
  sessionStore.delete('cloudSyncToken')
}

function getCloudSyncTokenForOwner (ownerUsername) {
  const owner = String(ownerUsername || '').trim()
  if (!owner) return null
  const syncOwner = String(sessionStore.get('cloudSyncOwner') || '').trim()
  const syncToken = sessionStore.get('cloudSyncToken') || null
  if (!syncToken || !syncOwner) return null
  if (syncOwner !== owner) return null
  return syncToken
}

/** Active admin session token, or persisted shop sync token for staff shifts. */
function getApiToken () {
  const sessionToken = getStoredApiToken() || presenceService.getToken() || null
  if (sessionToken) return sessionToken
  return getCloudSyncTokenForOwner(getOwnerUsername())
}

function notifySessionRevoked (payload = {}) {
  if (onSessionRevoked) {
    try { onSessionRevoked(payload) } catch (e) {}
  }
}

function markSessionAuthenticated () {
  sessionStore.set('sessionAuthenticatedAt', Date.now())
}

function clearSessionAuthenticatedAt () {
  sessionStore.delete('sessionAuthenticatedAt')
}

function isWithinSessionGrace () {
  const at = Number(sessionStore.get('sessionAuthenticatedAt') || 0)
  if (!at) return false
  const ttl = Number(SESSION_MIN_TTL_MS) > 0 ? Number(SESSION_MIN_TTL_MS) : (3 * 60 * 1000)
  return (Date.now() - at) < ttl
}

function isAuthBusy () {
  return Date.now() < authBusyUntil
}

function beginAuthBusy (ms = 15000) {
  authBusyUntil = Math.max(authBusyUntil, Date.now() + ms)
}

function endAuthBusy () {
  authBusyUntil = 0
}

function defaultRevokeMessage (reason) {
  if (reason === 'suspended') return 'This administrator account is suspended.'
  if (reason === 'deleted') return 'This administrator account was removed. Please contact your provider.'
  if (reason === 'expired') return 'Your session expired. Please sign in again.'
  return 'Your session ended. Please sign in again.'
}

/**
 * Map API auth errors to revoke reasons.
 * 401 = invalid/stale token — NOT "account deleted". Confirm via account-status first.
 * Stale token while account is still active → soft-degrade (no kick / no popup).
 */
async function classifySessionFailure (err, username) {
  const status = err && err.response && err.response.status
  if (status === 403) {
    return {
      valid: false,
      reason: 'suspended',
      message: defaultRevokeMessage('suspended')
    }
  }
  if (status !== 401) return null

  if (username) {
    try {
      let accountStatus = await api.checkAdminAccount(username)
      if (accountStatus === 'missing') {
        // Double-confirm — avoid false "removed" on transient API glitches.
        await new Promise(resolve => setTimeout(resolve, 600))
        accountStatus = await api.checkAdminAccount(username)
      }
      if (accountStatus === 'missing') {
        return {
          valid: false,
          reason: 'deleted',
          message: defaultRevokeMessage('deleted')
        }
      }
      if (accountStatus === 'suspended') {
        return {
          valid: false,
          reason: 'suspended',
          message: defaultRevokeMessage('suspended')
        }
      }
    } catch (e) {
      console.warn('account-status during classify failed', e && e.message)
      return { valid: true, ignored: true }
    }
  }

  // Account still exists — never force logout/popup for stale cloud token.
  if (isWithinSessionGrace() || isAuthBusy()) {
    console.warn('Ignoring stale-token failure within session grace/busy period')
    return { valid: true, ignored: true }
  }

  return { valid: true, softDegrade: true }
}

async function softDegradeCloudSession (reason = 'stale-token', failedToken = null) {
  const stored = getStoredApiToken()
  // Old presence heartbeat must not wipe a newer login token.
  if (failedToken && stored && failedToken !== stored) {
    console.warn('Ignoring soft-degrade for outdated token; refreshing presence to session token')
    try { await presenceService.start(stored) } catch (e) {}
    return { valid: true, ignored: true }
  }

  console.warn('Soft-degrading cloud session (keep local login):', reason)
  beginAuthBusy(15000)
  sessionStore.set('softDegradedAt', Date.now())
  try {
    await presenceService.stop({ notifyOffline: false, clearToken: true })
  } catch (e) {}
  sessionStore.delete('apiToken')
  clearCloudSyncCredentials()
  presenceService.setToken(null)
  return { valid: true, degraded: true }
}

function isCloudSoftDegraded () {
  return !!sessionStore.get('softDegradedAt')
}

function clearSoftDegradedFlag () {
  sessionStore.delete('softDegradedAt')
}

function setRememberMe (enabled, user = null) {
  if (enabled && user) {
    sessionStore.set('rememberMe', true)
    sessionStore.set('rememberedUser', {
      username: user.username,
      role: user.role || 'staff',
      owner_username: user.owner_username || ((user.role || '').toLowerCase() === 'admin' ? user.username : null)
    })
  } else {
    sessionStore.delete('rememberMe')
    sessionStore.delete('rememberedUser')
  }
}

function getRememberedLogin () {
  if (!sessionStore.get('rememberMe')) return null
  return sessionStore.get('rememberedUser') || null
}

async function revokeSession ({ reason = 'revoked', message = null } = {}) {
  if (revokingSession) {
    return { revoked: true, reason, message: message || defaultRevokeMessage(reason) }
  }
  revokingSession = true

  const user = getCurrentUser()
  const username = user && user.username
  const finalMessage = message || defaultRevokeMessage(reason)

  console.warn('revokeSession', reason, finalMessage)

  try {
    try {
      await presenceService.stop({ notifyOffline: reason !== 'deleted' })
    } catch (e) {}

    sessionStore.delete('apiToken')
    sessionStore.delete('currentUser')
    clearSessionAuthenticatedAt()
    clearCloudSyncCredentials()
    presenceService.setToken(null)

    // Only wipe local shop/admin cache when the cloud account is truly gone/suspended.
    if (username) {
      if (reason === 'deleted') {
        try { db.purgeShopData(username) } catch (e) {}
        try { db.purgeCloudAdmin(username) } catch (e) {}
      } else if (reason === 'suspended') {
        try { db.deactivateCloudAdmin(username) } catch (e) {}
      }
    }

    notifySessionRevoked({
      reason,
      message: finalMessage
    })

    return { revoked: true, reason, message: finalMessage }
  } finally {
    revokingSession = false
  }
}

async function validateCloudSession () {
  // Skip while login/logout is settling — avoids false revoke on token rotation.
  if (isAuthBusy()) return { valid: true }

  const user = getCurrentUser()
  if (!user || (user.role || '').toLowerCase() !== 'admin') {
    return { valid: true }
  }

  let apiUp = false
  try { apiUp = await api.isApiOnline() } catch (e) {}
  if (!apiUp) return { valid: true }

  const token = getStoredApiToken()
  if (token) {
    try {
      await api.adminMe(token)
      return { valid: true }
    } catch (err) {
      if (isAuthBusy()) return { valid: true }
      // Concurrent re-login may have rotated the token while this request was in flight.
      const tokenNow = getStoredApiToken()
      if (tokenNow && tokenNow !== token) return { valid: true }

      const classified = await classifySessionFailure(err, user.username)
      if (classified) return classified
      return { valid: true }
    }
  }

  // No cloud token = offline / soft-degraded local admin session.
  // Do NOT treat this as "account removed" (that caused false popups after soft-degrade).
  return { valid: true }
}

async function enforceCloudSessionOrLogout () {
  const result = await validateCloudSession()
  if (result && result.softDegrade) {
    return softDegradeCloudSession('enforce-stale-token')
  }
  if (!result.valid) {
    await revokeSession({ reason: result.reason, message: result.message })
  }
  return result
}

function isAuthFailure (err) {
  const status = err && err.response && err.response.status
  return status === 401 || status === 403
}

async function handleAuthFailureFromApi (err, failedToken = null) {
  if (!isAuthFailure(err)) return false
  if (isAuthBusy()) return false

  const stored = getStoredApiToken()
  const syncToken = getCloudSyncTokenForOwner(getOwnerUsername())

  // Presence may still hold an old token after a newer login — refresh, don't wipe.
  if (failedToken && stored && failedToken !== stored) {
    console.warn('Ignoring auth failure for outdated token')
    try { await presenceService.start(stored) } catch (e) {}
    return false
  }

  if (stored) {
    const user = getCurrentUser()
    const classified = await classifySessionFailure(err, user && user.username)
    if (!classified) return false
    if (classified.softDegrade) {
      await softDegradeCloudSession('heartbeat-stale-token', failedToken || stored)
      return true
    }
    if (!classified.valid) {
      await revokeSession({ reason: classified.reason, message: classified.message })
      return true
    }
    return false
  }

  // Staff shift using shop sync token only — clear stale credentials, keep local login.
  if (syncToken && (!failedToken || failedToken === syncToken)) {
    console.warn('Clearing stale shop sync token after API auth failure')
    clearCloudSyncCredentials()
    return true
  }

  return false
}

async function verifyUser (username, password, expectedRole) {
  try {
    const role = expectedRole ? String(expectedRole).toLowerCase() : null
    let candidates = []
    if (role === 'staff') {
      candidates = db.listUsersByUsername(username, { role: 'staff' })
    } else if (role === 'admin') {
      const row = db.getUserByUsername(username, { role: 'admin' })
      if (row) candidates = [row]
    } else {
      candidates = db.listUsersByUsername(username)
    }

    const matches = []
    for (const row of candidates) {
      if ((row.status || 'active').toLowerCase() !== 'active') continue
      if (role && (row.role || 'staff').toLowerCase() !== role) continue
      const ok = await bcrypt.compare(password, row.password_hash)
      if (ok) matches.push(row)
    }

    if (!matches.length) return null
    if (matches.length > 1) {
      throw new Error('Multiple accounts match this username on this device. Use a unique staff username per shop.')
    }

    const row = matches[0]
    return {
      id: row.id,
      username: row.username,
      full_name: row.full_name || row.username,
      role: row.role || 'staff',
      status: row.status || 'active',
      created_at: row.created_at,
      shop_name: row.shop_name || null,
      owner_username: row.owner_username || ((row.role || '').toLowerCase() === 'admin' ? row.username : null),
      source: 'local'
    }
  } catch (err) {
    console.error('verifyUser error', err)
    throw err
  }
}

async function upsertCloudAdminLocally (admin, password) {
  const username = admin.username
  const hash = await bcrypt.hash(password, 10)
  const existing = db.getUserByUsername(username, { role: 'admin' })
  const fullName = admin.full_name || admin.shop_name || username
  const cloudAdminId = admin.id != null ? String(admin.id) : null

  // Recreated cloud admin with same username must not inherit old local shop data.
  if (cloudAdminId && existing && existing.cloud_admin_id) {
    if (String(existing.cloud_admin_id) !== cloudAdminId) {
      try { db.purgeShopData(username) } catch (e) {}
    }
  } else if (cloudAdminId && existing && !existing.cloud_admin_id && db.countTransactionsForOwner(username) > 0) {
    const cloudCreated = admin.created_at || null
    if (cloudCreated && db.hasTransactionsBefore(username, cloudCreated)) {
      try { db.purgeShopData(username) } catch (e) {}
    }
  } else if (cloudAdminId && !existing && db.countTransactionsForOwner(username) > 0) {
    const cloudCreated = admin.created_at || null
    if (!cloudCreated || db.hasTransactionsBefore(username, cloudCreated)) {
      try { db.purgeShopData(username) } catch (e) {}
    }
  }

  const adminPatch = {
    username,
    full_name: fullName,
    role: 'admin',
    status: admin.status === 'suspended' ? 'inactive' : 'active',
    password_hash: hash,
    cloud_synced: 1,
    owner_username: username
  }
  if (cloudAdminId) adminPatch.cloud_admin_id = cloudAdminId

  if (existing) {
    db.updateUser(existing.id, adminPatch)
  } else {
    db.createUser(username, hash, {
      full_name: fullName,
      role: 'admin',
      status: 'active',
      owner_username: username
    })
    const created = db.getUserByUsername(username, { role: 'admin' })
    if (created) {
      try { db.updateUser(created.id, adminPatch) } catch (e) {}
    }
  }

  // Disable legacy local-only default admin so it cannot confuse sessions.
  try { db.deactivateLegacyLocalAdmin(username) } catch (e) {}

  const row = db.getUserByUsername(username, { role: 'admin' })
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name || row.username,
    role: 'admin',
    status: row.status || 'active',
    shop_name: admin.shop_name || null,
    owner_username: row.username,
    source: 'cloud',
    cloud_synced: true
  }
}

function apiErrorMessage (err, fallback) {
  if (err && err.response && err.response.data && err.response.data.message) {
    return err.response.data.message
  }
  if (err && err.code === 'ECONNREFUSED') return 'Cannot reach server. Check if Gcashweb is running.'
  if (err && err.message && /timeout|ENOTFOUND|ECONNREFUSED|network/i.test(err.message)) {
    return 'Cannot reach server. You can login offline only after a previous successful online login.'
  }
  return fallback || (err && err.message) || 'Login failed'
}

async function login (username, password, role, options = {}) {
  const expectedRole = String(role || 'staff').toLowerCase()
  const rememberMe = !!options.rememberMe
  const myGen = ++loginGeneration
  beginAuthBusy(30000)

  const run = async () => {
    // Staff accounts remain local-only
    if (expectedRole !== 'admin') {
      let user = await verifyUser(username, password, expectedRole)
      if (!user) return { success: false, error: 'Invalid credentials' }
      if (!user.owner_username) {
        return { success: false, error: 'This staff account is not linked to a shop admin. Ask your Administrator to recreate the staff account.' }
      }
      if (myGen !== loginGeneration) {
        return { success: false, error: 'Login superseded. Please try again.' }
      }
      sessionStore.set('currentUser', user)
      // Staff has no admin session; keep shop cloudSyncToken for transaction sync.
      sessionStore.delete('apiToken')
      try { await presenceService.stop({ notifyOffline: true }) } catch (e) {}
      presenceService.setToken(null)
      setRememberMe(rememberMe, user)
      // Safe claim of legacy unowned rows when only one shop exists on this PC.
      try { db.claimOrphanShopData(user.owner_username) } catch (e) {}
      return { success: true, user }
    }

    // Administrator: cloud-first, local offline fallback
    try {
      const data = await api.adminLogin(username, password)
      if (myGen !== loginGeneration) {
        return { success: false, error: 'Login superseded. Please try again.' }
      }
      const cloudAdmin = data.admin || {}
      const token = data.token
      const user = await upsertCloudAdminLocally(cloudAdmin, password)

      if (myGen !== loginGeneration) {
        return { success: false, error: 'Login superseded. Please try again.' }
      }

      sessionStore.set('apiToken', token)
      setCloudSyncCredentials(user.username, token)
      clearSoftDegradedFlag()
      sessionStore.set('currentUser', user)
      sessionStore.set('lastCloudAdmin', {
        username: user.username,
        shop_name: cloudAdmin.shop_name || null,
        synced_at: new Date().toISOString()
      })
      markSessionAuthenticated()

      await presenceService.start(token)
      // Confirm token works on the same host we just logged into.
      try {
        await api.adminMe(token)
      } catch (verifyErr) {
        console.warn('Post-login token verify failed', verifyErr && verifyErr.message)
      }
      setRememberMe(rememberMe, user)
      try { db.claimOrphanShopData(user.username) } catch (e) {}
      return { success: true, user, online: true }
    } catch (err) {
      const status = err && err.response && err.response.status

      // Suspended / invalid credentials from server — do not silently fall back
      if (status === 401 || status === 403) {
        if (status === 403) {
          try { db.deactivateCloudAdmin(username) } catch (e) {}
        }
        return { success: false, error: apiErrorMessage(err, 'Invalid credentials') }
      }

      // Network / server down → offline local fallback (cloud-synced admins only)
      console.warn('Cloud admin login unavailable, trying offline cache:', err.message)
      const row = db.getUserByUsername(username, { role: 'admin' })
      if (!row || !row.cloud_synced) {
        return {
          success: false,
          error: apiErrorMessage(err, 'Admin login requires internet for first-time access.')
        }
      }
      const user = await verifyUser(username, password, 'admin')
      if (!user) {
        return {
          success: false,
          error: apiErrorMessage(err, 'Admin login requires internet for first-time access.')
        }
      }

      if (myGen !== loginGeneration) {
        return { success: false, error: 'Login superseded. Please try again.' }
      }

      sessionStore.set('currentUser', user)
      sessionStore.delete('apiToken')
      presenceService.setToken(null)
      setRememberMe(rememberMe, user)
      try { db.claimOrphanShopData(user.username) } catch (e) {}
      return { success: true, user, online: false, offline: true }
    }
  }

  const resultPromise = loginChain.then(run, run)
  loginChain = resultPromise.then(() => {}, () => {})
  try {
    return await resultPromise
  } finally {
    if (myGen === loginGeneration) beginAuthBusy(10000)
  }
}

async function logout () {
  beginAuthBusy(10000)
  const token = sessionStore.get('apiToken') || presenceService.getToken() || getCloudSyncTokenForOwner(getOwnerUsername())
  const isAdmin = ((getCurrentUser() || {}).role || '').toLowerCase() === 'admin'
  try {
    if (token && isAdmin) {
      await presenceService.stop({ notifyOffline: true })
      try { await api.adminLogout(token) } catch (e) {}
      clearCloudSyncCredentials()
    } else {
      await presenceService.stop({ notifyOffline: false })
      // Staff logout keeps cloudSyncToken so pending txns can still sync this shift.
    }
  } finally {
    sessionStore.delete('apiToken')
    sessionStore.delete('currentUser')
    clearSessionAuthenticatedAt()
    setRememberMe(false)
  }
  return { success: true }
}

async function createUser (username, password) {
  const hash = await bcrypt.hash(password, 10)
  return db.createUser(username, hash, { role: 'admin', status: 'active', full_name: 'Administrator' })
}

async function syncStaffCreateToCloud (payload = {}) {
  const token = getApiToken()
  if (!token) return { ok: false, error: 'No cloud session. Login as admin online to sync staff.' }
  try {
    const online = await api.isApiOnline()
    if (!online) return { ok: false, error: 'Cloud server unreachable. Staff saved locally only.' }
    const res = await api.staffCreate(token, {
      username: payload.username,
      password: payload.password,
      full_name: payload.full_name || '',
      status: payload.status || 'active'
    })
    if (res && res.staff) return { ok: true, staff: res.staff }
    return { ok: false, error: 'Cloud did not return staff record.' }
  } catch (err) {
    console.error('syncStaffCreateToCloud error', err.message)
    const msg = (err.response && err.response.data && err.response.data.message)
      || err.message
      || 'Cloud staff create failed'
    return { ok: false, error: msg }
  }
}

async function syncStaffUpdateToCloud (cloudStaffId, payload = {}) {
  const token = getApiToken()
  if (!token) return { ok: false, error: 'No cloud session. Login as admin online to sync staff.' }
  if (!cloudStaffId) return { ok: false, error: 'Staff is not linked to cloud yet.' }
  try {
    const online = await api.isApiOnline()
    if (!online) return { ok: false, error: 'Cloud server unreachable. Local update only.' }
    const body = {
      username: payload.username,
      full_name: payload.full_name || '',
      status: payload.status || 'active'
    }
    if (payload.password) body.password = payload.password
    const res = await api.staffUpdate(token, cloudStaffId, body)
    if (res && res.staff) return { ok: true, staff: res.staff }
    return { ok: false, error: 'Cloud did not return staff record.' }
  } catch (err) {
    console.error('syncStaffUpdateToCloud error', err.message)
    const msg = (err.response && err.response.data && err.response.data.message)
      || err.message
      || 'Cloud staff update failed'
    return { ok: false, error: msg }
  }
}

async function syncStaffDeleteToCloud (cloudStaffId) {
  const token = getApiToken()
  if (!token) return { ok: false, error: 'No cloud session. Login as admin online to sync staff.' }
  if (!cloudStaffId) return { ok: true, skipped: true }
  try {
    const online = await api.isApiOnline()
    if (!online) return { ok: false, error: 'Cloud server unreachable. Deleted locally only.' }
    await api.staffDelete(token, cloudStaffId)
    return { ok: true }
  } catch (err) {
    console.error('syncStaffDeleteToCloud error', err.message)
    const msg = (err.response && err.response.data && err.response.data.message)
      || err.message
      || 'Cloud staff delete failed'
    return { ok: false, error: msg }
  }
}

function assertCloudCompatibleUsername (username) {
  // Must match Laravel StaffAccountController: alpha_dash
  if (!/^[A-Za-z0-9_-]+$/.test(username)) {
    throw new Error('Username may only contain letters, numbers, dashes, and underscores.')
  }
}

async function createStaffAccount (payload = {}) {
  requireAdmin()
  const owner = getOwnerUsername()
  if (!owner) throw new Error('Login as Administrator first before creating staff.')
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '')
  if (!username) throw new Error('Username is required')
  assertCloudCompatibleUsername(username)
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters')
  const hash = await bcrypt.hash(password, 10)
  const created = db.createUser(username, hash, {
    full_name: String(payload.full_name || '').trim(),
    role: 'staff',
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    owner_username: owner
  })

  const cloudResult = await syncStaffCreateToCloud({
    username,
    password,
    full_name: String(payload.full_name || '').trim(),
    status: payload.status === 'inactive' ? 'inactive' : 'active'
  })
  if (cloudResult && cloudResult.ok && cloudResult.staff && cloudResult.staff.id && created && created.id) {
    try {
      db.updateUser(created.id, { cloud_staff_id: String(cloudResult.staff.id) }, owner)
    } catch (e) {}
  }

  return {
    ...created,
    cloud_synced: !!(cloudResult && cloudResult.ok),
    cloud_warning: (cloudResult && cloudResult.ok) ? null : (cloudResult && cloudResult.error) || 'Saved locally but not synced to cloud.'
  }
}

async function updateStaffAccount (id, payload = {}) {
  requireAdmin()
  const owner = getOwnerUsername()
  if (!owner) throw new Error('Login as Administrator first before editing staff.')
  const row = db.getUserById(id, owner)
  const updates = {
    username: String(payload.username || '').trim(),
    full_name: String(payload.full_name || '').trim(),
    role: 'staff',
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    owner_username: owner
  }
  if (!updates.username) throw new Error('Username is required')
  assertCloudCompatibleUsername(updates.username)
  if (payload.password) {
    if (String(payload.password).length < 6) throw new Error('Password must be at least 6 characters')
    updates.password_hash = await bcrypt.hash(String(payload.password), 10)
  }
  const result = db.updateUser(id, updates, owner)

  const cloudStaffId = (row && row.cloud_staff_id) || null
  const cloudResult = await syncStaffUpdateToCloud(cloudStaffId, {
    username: updates.username,
    full_name: updates.full_name,
    status: updates.status,
    password: payload.password || null
  })

  return {
    ...result,
    cloud_synced: !!(cloudResult && cloudResult.ok),
    cloud_warning: (cloudResult && cloudResult.ok) ? null : (cloudResult && cloudResult.error) || 'Updated locally but not synced to cloud.'
  }
}

async function deleteStaffAccount (id) {
  requireAdmin()
  const owner = getOwnerUsername()
  if (!owner) throw new Error('Login as Administrator first before deleting staff.')
  const staffRow = db.getUserById(id, owner)
  const cloudStaffId = staffRow && staffRow.cloud_staff_id ? staffRow.cloud_staff_id : null
  const result = db.deleteUser(id, owner)
  let cloudWarning = null
  if (cloudStaffId) {
    const cloudResult = await syncStaffDeleteToCloud(cloudStaffId)
    if (!cloudResult || !cloudResult.ok) {
      cloudWarning = (cloudResult && cloudResult.error) || 'Deleted locally but still exists on cloud.'
    }
  }
  return {
    ...result,
    cloud_synced: !cloudWarning,
    cloud_warning: cloudWarning
  }
}

function getCurrentUser () {
  return sessionStore.get('currentUser') || null
}

function requireSession () {
  const user = getCurrentUser()
  if (!user) throw new Error('Not signed in. Please login again.')
  return user
}

function requireAdmin () {
  const user = requireSession()
  if ((user.role || '').toLowerCase() !== 'admin') {
    throw new Error('Only Administrator can perform this action.')
  }
  return user
}

function getOwnerUsername () {
  const user = getCurrentUser()
  if (!user) return null
  if ((user.role || '').toLowerCase() === 'admin') return user.username
  return user.owner_username || null
}

async function initAuth () {
  // Cloud-managed admins: no default local admin.
  // First Administrator login must succeed online via Gcashweb, then offline cache works.
  try {
    db.deactivateLegacyLocalAdmin('')
    try { db.purgeLegacyLocalAdmin() } catch (e) {}

    const rememberMe = !!sessionStore.get('rememberMe')
    const savedUser = sessionStore.get('currentUser') || null

    if (rememberMe && savedUser && savedUser.username) {
      // Resume mid-shift session after crash/restart when Remember me was enabled.
      sessionStore.set('currentUser', savedUser)
      const owner = (savedUser.role || '').toLowerCase() === 'admin'
        ? savedUser.username
        : (savedUser.owner_username || null)
      const syncToken = getCloudSyncTokenForOwner(owner)
      if ((savedUser.role || '').toLowerCase() === 'admin' && syncToken) {
        sessionStore.set('apiToken', syncToken)
        try { await presenceService.start(syncToken) } catch (e) {}
      } else {
        sessionStore.delete('apiToken')
        presenceService.setToken(null)
      }
      markSessionAuthenticated()
    } else {
      // Fresh login required — clear UI session.
      // Keep cloudSyncToken so staff can still sync after restart (until admin logout/revoke).
      sessionStore.delete('apiToken')
      sessionStore.delete('currentUser')
    }
  } catch (err) {
    console.error('initAuth error', err)
  }
}

module.exports = {
  verifyUser,
  createUser,
  createStaffAccount,
  updateStaffAccount,
  deleteStaffAccount,
  initAuth,
  login,
  logout,
  getCurrentUser,
  getOwnerUsername,
  getApiToken,
  getStoredApiToken,
  requireSession,
  requireAdmin,
  setSessionRevokedHandler,
  validateCloudSession,
  enforceCloudSessionOrLogout,
  revokeSession,
  handleAuthFailureFromApi,
  isAuthFailure,
  isAuthBusy,
  beginAuthBusy,
  isCloudSoftDegraded,
  clearSoftDegradedFlag,
  getRememberedLogin,
  setRememberMe
}
