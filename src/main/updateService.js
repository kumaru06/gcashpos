const { app, BrowserWindow } = require('electron')
const { autoUpdater } = require('electron-updater')

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let checkTimer = null
let onBeforeInstall = null
let pendingUpdate = null

function broadcast (channel, payload) {
  BrowserWindow.getAllWindows().forEach(function (win) {
    if (win && !win.isDestroyed()) {
      try { win.webContents.send(channel, payload) } catch (e) {}
    }
  })
}

function getStatusPayload (extra) {
  return {
    currentVersion: app.getVersion(),
    pendingVersion: pendingUpdate && pendingUpdate.version ? pendingUpdate.version : null,
    ...extra
  }
}

function initAutoUpdater (options = {}) {
  onBeforeInstall = options.onBeforeInstall || null

  if (!app.isPackaged) {
    console.log('[update] Auto-update disabled in development')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', function () {
    broadcast('updater:status', getStatusPayload({ state: 'checking' }))
  })

  autoUpdater.on('update-not-available', function () {
    broadcast('updater:status', getStatusPayload({ state: 'idle' }))
  })

  autoUpdater.on('update-available', function (info) {
    pendingUpdate = info
    broadcast('updater:status', getStatusPayload({
      state: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || null
    }))
  })

  autoUpdater.on('download-progress', function (progress) {
    broadcast('updater:status', getStatusPayload({
      state: 'downloading',
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total
    }))
  })

  autoUpdater.on('update-downloaded', function (info) {
    pendingUpdate = info
    broadcast('updater:status', getStatusPayload({
      state: 'ready',
      version: info.version
    }))
  })

  autoUpdater.on('error', function (err) {
    console.warn('[update] error', err && err.message)
    broadcast('updater:status', getStatusPayload({
      state: 'error',
      message: (err && err.message) || 'Update check failed'
    }))
  })

  setTimeout(function () { checkForUpdates(false) }, 8000)

  if (checkTimer) clearInterval(checkTimer)
  checkTimer = setInterval(function () { checkForUpdates(false) }, CHECK_INTERVAL_MS)
}

async function checkForUpdates (manual) {
  if (!app.isPackaged) {
    return {
      ok: false,
      manual: !!manual,
      message: 'Auto-update runs in the installed app only.'
    }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const info = result && result.updateInfo
    const hasUpdate = !!(info && info.version && info.version !== app.getVersion())
    if (!hasUpdate) {
      const message = 'You are on the latest version.'
      if (manual) {
        broadcast('updater:status', getStatusPayload({ state: 'idle', message }))
      }
      return { ok: true, manual: !!manual, upToDate: true, message }
    }
    return { ok: true, manual: !!manual, upToDate: false, version: info.version }
  } catch (err) {
    const message = (err && err.message) || 'Could not check for updates'
    if (manual) {
      broadcast('updater:status', getStatusPayload({ state: 'error', message }))
    }
    return { ok: false, manual: !!manual, message }
  }
}

async function downloadUpdate () {
  if (!app.isPackaged) return { ok: false, message: 'Not available in development' }
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (err) {
    return { ok: false, message: (err && err.message) || 'Download failed' }
  }
}

function installUpdate () {
  if (!app.isPackaged) return { ok: false, message: 'Not available in development' }
  if (typeof onBeforeInstall === 'function') {
    try { onBeforeInstall() } catch (e) {}
  }
  autoUpdater.quitAndInstall(false, true)
  return { ok: true }
}

function stopAutoUpdateChecks () {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  stopAutoUpdateChecks,
  getCurrentVersion: () => app.getVersion()
}
