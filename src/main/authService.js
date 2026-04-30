const bcrypt = require('bcryptjs')
const db = require('./database')

async function verifyUser (username, password, expectedRole) {
  try {
    const row = db.getUserByUsername(username)
    if (!row) return null
    if ((row.status || 'active').toLowerCase() !== 'active') return null
    if (expectedRole && (row.role || 'staff').toLowerCase() !== String(expectedRole).toLowerCase()) return null
    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) return null
    return { id: row.id, username: row.username, full_name: row.full_name || row.username, role: row.role || 'staff', status: row.status || 'active', created_at: row.created_at }
  } catch (err) {
    console.error('verifyUser error', err)
    throw err
  }
}

async function createUser (username, password) {
  const hash = await bcrypt.hash(password, 10)
  return db.createUser(username, hash, { role: 'admin', status: 'active', full_name: 'Administrator' })
}

async function createStaffAccount (payload = {}) {
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '')
  if (!username) throw new Error('Username is required')
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters')
  const hash = await bcrypt.hash(password, 10)
  return db.createUser(username, hash, {
    full_name: String(payload.full_name || '').trim(),
    role: payload.role === 'admin' ? 'admin' : 'staff',
    status: payload.status === 'inactive' ? 'inactive' : 'active'
  })
}

async function updateStaffAccount (id, payload = {}) {
  const updates = {
    username: String(payload.username || '').trim(),
    full_name: String(payload.full_name || '').trim(),
    role: payload.role === 'admin' ? 'admin' : 'staff',
    status: payload.status === 'inactive' ? 'inactive' : 'active'
  }
  if (!updates.username) throw new Error('Username is required')
  if (payload.password) {
    if (String(payload.password).length < 6) throw new Error('Password must be at least 6 characters')
    updates.password_hash = await bcrypt.hash(String(payload.password), 10)
  }
  return db.updateUser(id, updates)
}

async function initAuth () {
  try {
    const cnt = db.countUsers()
    const defaultPass = 'admin123'
    if (!cnt || cnt === 0) {
      // create default admin
      await createUser('admin', defaultPass)
      console.log('Created default admin user (username: admin)')
      return
    }

    const users = db.listUsers ? db.listUsers() : []
    const activeAdmin = users.find(user => (user.role || '').toLowerCase() === 'admin' && (user.status || 'active').toLowerCase() === 'active')
    if (!activeAdmin) {
      const existingAdmin = db.getUserByUsername('admin')
      if (existingAdmin) {
        await db.updateUser(existingAdmin.id, { role: 'admin', status: 'active' })
        console.log('Reactivated default admin user (username: admin)')
      } else {
        await createUser('admin', defaultPass)
        console.log('Recreated default admin user (username: admin)')
      }
    }
  } catch (err) {
    console.error('initAuth error', err)
  }
}

module.exports = { verifyUser, createUser, createStaffAccount, updateStaffAccount, initAuth }

