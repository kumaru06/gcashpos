const bcrypt = require('bcryptjs')
const db = require('./database')

async function verifyUser (username, password) {
  try {
    const row = db.getUserByUsername(username)
    if (!row) return null
    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) return null
    return { id: row.id, username: row.username, created_at: row.created_at }
  } catch (err) {
    console.error('verifyUser error', err)
    throw err
  }
}

async function createUser (username, password) {
  const hash = await bcrypt.hash(password, 10)
  return db.createUser(username, hash)
}

async function initAuth () {
  try {
    const cnt = db.countUsers()
    if (!cnt || cnt === 0) {
      // create default admin
      const defaultPass = 'admin123'
      await createUser('admin', defaultPass)
      console.log('Created default admin user (username: admin)')
    }
  } catch (err) {
    console.error('initAuth error', err)
  }
}

module.exports = { verifyUser, createUser, initAuth }

