const api = require('./apiClient')
const { HEARTBEAT_INTERVAL_MS } = require('../config/constants')

let heartbeatTimer = null
let currentToken = null
let lastOnline = null
let lastHeartbeatAt = null
let lastError = null

async function handlePresenceAuthError (err, failedToken = null) {
  try {
    const authService = require('./authService')
    await authService.handleAuthFailureFromApi(err, failedToken)
  } catch (e) {}
}

function getToken () {
  return currentToken
}

function setToken (token) {
  currentToken = token || null
}

function getPresenceState () {
  return {
    hasSession: !!currentToken,
    online: lastOnline,
    lastHeartbeatAt,
    lastError
  }
}

async function start (token) {
  await stop({ notifyOffline: false })
  if (!token) return
  currentToken = token

  try {
    await api.presenceOnline(token)
    lastOnline = true
    lastHeartbeatAt = new Date().toISOString()
    lastError = null
  } catch (err) {
    lastOnline = false
    lastError = err.message
    console.warn('presence online failed', err.message)
    // Do not revoke on the first online ping — heartbeats will retry.
    // Immediate revoke here races with fresh login and causes false "session expired".
  }

  heartbeatTimer = setInterval(async () => {
    // Prefer canonical session token so an outdated presence token cannot wipe a new login.
    let hbToken = currentToken
    try {
      const stored = require('./authService').getStoredApiToken()
      if (stored) {
        hbToken = stored
        currentToken = stored
      }
    } catch (e) {}
    if (!hbToken) return
    try {
      await api.presenceHeartbeat(hbToken)
      lastOnline = true
      lastHeartbeatAt = new Date().toISOString()
      lastError = null
    } catch (err) {
      lastOnline = false
      lastError = err.message
      console.warn('presence heartbeat failed', err.message)
      await handlePresenceAuthError(err, hbToken)
    }
  }, HEARTBEAT_INTERVAL_MS)
}

async function stop ({ notifyOffline = true, clearToken = true } = {}) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  const token = currentToken
  if (clearToken) currentToken = null

  if (notifyOffline && token) {
    try {
      await api.presenceOffline(token)
    } catch (err) {
      console.warn('presence offline failed', err.message)
    }
  }

  lastOnline = false
}

async function resumeIfPossible () {
  if (!currentToken) return { online: false, hasSession: false }
  return start(currentToken)
}

async function pulseIfLoggedIn () {
  const token = currentToken
  if (!token) {
    return { online: await api.isApiOnline(), hasSession: false }
  }
  try {
    await api.presenceHeartbeat(token)
    lastOnline = true
    lastHeartbeatAt = new Date().toISOString()
    lastError = null
    return { online: true, hasSession: true, lastHeartbeatAt }
  } catch (err) {
    lastOnline = false
    lastError = err.message
    await handlePresenceAuthError(err, token)
    const apiUp = await api.isApiOnline()
    return { online: apiUp, hasSession: !!currentToken, lastError: err.message }
  }
}

module.exports = { start, stop, getToken, setToken, getPresenceState, pulseIfLoggedIn, resumeIfPossible }
