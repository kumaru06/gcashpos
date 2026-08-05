const axios = require('axios')
const { resolveApiEndpoint } = require('../config/constants')

function primaryClient () {
  return axios.create({
    baseURL: resolveApiEndpoint(),
    timeout: 8000,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
  })
}

function healthUrl () {
  return String(resolveApiEndpoint()).replace(/\/api\/?$/, '') + '/up'
}

async function withPrimary (requestFn) {
  return requestFn(primaryClient())
}

async function isInternetOnline () {
  // Optional public-network probe (for badge detail only).
  const probes = [
    'http://connectivitycheck.gstatic.com/generate_204',
    'http://www.msftconnecttest.com/connecttest.txt',
    'http://1.1.1.1/'
  ]
  for (const url of probes) {
    try {
      const res = await axios.get(url, {
        timeout: 2000,
        validateStatus: () => true,
        maxRedirects: 0
      })
      if (res && res.status >= 200 && res.status < 500) return true
    } catch (err) {}
  }
  return false
}

async function isApiOnline () {
  try {
    const res = await axios.get(healthUrl(), {
      timeout: 2500,
      validateStatus: () => true,
      headers: { Accept: 'application/json' }
    })
    if (res && res.status >= 200 && res.status < 400) return true
  } catch (err) {}
  return false
}

/**
 * Online for sync/presence = Gcashweb API reachable.
 * Do NOT require public internet probes (Laragon-only / blocked probes used to false-Offline).
 */
async function isOnline () {
  return isApiOnline()
}

async function adminLogin (username, password) {
  const res = await withPrimary(client =>
    client.post('/admin/login', { username, password })
  )
  return res.data
}

async function adminMe (token) {
  const res = await withPrimary(client =>
    client.get('/admin/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function checkAdminAccount (username) {
  try {
    const res = await withPrimary(client =>
      client.post('/admin/account-status', { username })
    )
    return (res.data && res.data.status) || 'active'
  } catch (err) {
    const status = err.response && err.response.status
    const data = err.response && err.response.data
    // Only trust explicit JSON payloads — HTML/random 404 is NOT "missing".
    if (status === 404 && data && data.status === 'missing') return 'missing'
    if (status === 403 && data && (data.status === 'suspended' || /suspend/i.test(String(data.message || '')))) {
      return 'suspended'
    }
    throw err
  }
}

async function adminLogout (token) {
  if (!token) return null
  const res = await withPrimary(client =>
    client.post('/admin/logout', null, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function presenceOnline (token) {
  const res = await withPrimary(client =>
    client.post('/admin/presence/online', null, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function presenceHeartbeat (token) {
  const res = await withPrimary(client =>
    client.post('/admin/presence/heartbeat', null, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function presenceOffline (token) {
  const res = await withPrimary(client =>
    client.post('/admin/presence/offline', null, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function staffList (token) {
  const res = await withPrimary(client =>
    client.get('/admin/staff', {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function staffCreate (token, payload) {
  const res = await withPrimary(client =>
    client.post('/admin/staff', payload, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function staffUpdate (token, cloudStaffId, payload) {
  const res = await withPrimary(client =>
    client.put(`/admin/staff/${cloudStaffId}`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function staffDelete (token, cloudStaffId) {
  const res = await withPrimary(client =>
    client.delete(`/admin/staff/${cloudStaffId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function syncTransactions (token, transactions) {
  const res = await withPrimary(client =>
    client.post('/admin/transactions/sync', { transactions }, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

async function deleteTransaction (token, referenceNumber) {
  const res = await withPrimary(client =>
    client.post('/admin/transactions/delete', {
      reference_number: referenceNumber
    }, {
      headers: { Authorization: `Bearer ${token}` }
    })
  )
  return res.data
}

module.exports = {
  isInternetOnline,
  isApiOnline,
  isOnline,
  adminLogin,
  adminMe,
  checkAdminAccount,
  adminLogout,
  presenceOnline,
  presenceHeartbeat,
  presenceOffline,
  staffList,
  staffCreate,
  staffUpdate,
  staffDelete,
  syncTransactions,
  deleteTransaction
}
