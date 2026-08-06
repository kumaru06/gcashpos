const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const LEGACY_DIR_NAMES = ['GCash POS', 'gcash-pos', 'Gcash POS']

function copyIfMissing (src, dest) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return
  fs.cpSync(src, dest, { recursive: true, force: false })
}

function migrateLegacyUserData () {
  if (!app.isPackaged) return

  const newDir = app.getPath('userData')
  if (fs.existsSync(path.join(newDir, 'gcash-pos.db'))) return

  const appData = app.getPath('appData')

  for (const name of LEGACY_DIR_NAMES) {
    const legacyDir = path.join(appData, name)
    if (!fs.existsSync(legacyDir) || legacyDir === newDir) continue

    try {
      fs.mkdirSync(newDir, { recursive: true })
      for (const entry of fs.readdirSync(legacyDir)) {
        copyIfMissing(path.join(legacyDir, entry), path.join(newDir, entry))
      }
      console.log('[migrate] Copied legacy data from', legacyDir)
      return
    } catch (err) {
      console.warn('[migrate] Failed copying from', legacyDir, err && err.message)
    }
  }
}

module.exports = { migrateLegacyUserData }
