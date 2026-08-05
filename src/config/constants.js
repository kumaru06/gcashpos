const DEFAULT_API_ENDPOINT = 'http://gcashweb.test/api'

function normalizeApiEndpoint (value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return DEFAULT_API_ENDPOINT
  return /\/api$/i.test(raw) ? raw : `${raw}/api`
}

function resolveApiEndpoint () {
  if (process.env.GCASHPOS_API_URL) {
    return normalizeApiEndpoint(process.env.GCASHPOS_API_URL)
  }
  try {
    const Store = require('electron-store')
    const store = new Store({ name: 'gcashpos-settings' })
    const custom = store.get('apiEndpoint')
    if (custom) return normalizeApiEndpoint(custom)
  } catch (e) {}
  return DEFAULT_API_ENDPOINT
}

function setApiEndpoint (url) {
  const Store = require('electron-store')
  const store = new Store({ name: 'gcashpos-settings' })
  const normalized = normalizeApiEndpoint(url)
  store.set('apiEndpoint', normalized)
  return normalized
}

module.exports = {
  DEFAULT_API_ENDPOINT,
  get API_ENDPOINT () {
    return resolveApiEndpoint()
  },
  resolveApiEndpoint,
  setApiEndpoint,
  normalizeApiEndpoint,
  HEARTBEAT_INTERVAL_MS: 30 * 1000,
  // Soft window after login before treating stale-token as cloud degrade.
  SESSION_MIN_TTL_MS: 3 * 60 * 1000,
  PRIMARY_FROM: '#1E88E5',
  PRIMARY_TO: '#1565C0',
  SUCCESS: '#22C55E'
}
