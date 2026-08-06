const { app, BrowserWindow } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('./ipcHandlers')
const { initDatabase } = require('./database')
const authService = require('./authService')
const presenceService = require('./presenceService')
const updateService = require('./updateService')

// One POS window per machine — avoid concurrent UI races on shared SQLite.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length) {
      const win = wins[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    } else {
      createWindow()
    }
  })
}

function broadcastSessionRevoked (payload) {
  BrowserWindow.getAllWindows().forEach(function (win) {
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('auth:session-revoked', payload) } catch (e) {}
    }
  })
}

let mainWindow = null

function createWindow () {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return mainWindow
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'))
  win.once('ready-to-show', () => {
    // show window (do not auto-open DevTools in normal runs)
    win.show()
  })
  return win
}

if (gotLock) {
app.whenReady().then(async () => {
  try {
    await initDatabase()
    await authService.initAuth()

  } catch (err) {
    console.error('DB init failed', err)
  }

  registerIpcHandlers()
  authService.setSessionRevokedHandler(broadcastSessionRevoked)
  try {
    require('./syncService').startAutoSync(10 * 1000)
  } catch (e) {}
  createWindow()

  updateService.initAutoUpdater({
    onBeforeInstall: function () { isQuitting = true }
  })

  // Live-reload in development: watch renderer files and reload window on change
  if (!app.isPackaged) {
    try {
      const fs = require('fs')
      const watchPath = path.join(__dirname, '..', 'renderer')
      let reloadTimer = null
      fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        // Ignore noisy non-source churn
        if (/\.(png|jpg|jpeg|gif|ico|svg|map)$/i.test(filename)) return
        // debounce rapid changes (editing files should not thrash auth/session)
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => {
          try {
            if (mainWindow && !mainWindow.isDestroyed()) {
              try { authService.beginAuthBusy(8000) } catch (e) {}
              console.log('[dev] file changed, reloading renderer:', filename)
              mainWindow.webContents.reloadIgnoringCache()
            }
          } catch (e) {
            console.warn('[dev] reload failed', e)
          }
        }, 800)
      })
    } catch (e) {
      console.warn('Live-reload watcher not available', e)
    }
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
  })
})
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  // Electron does not wait for async before-quit handlers — preventDefault + exit after offline ping.
  event.preventDefault()
  isQuitting = true
  Promise.resolve()
    .then(() => presenceService.stop({ notifyOffline: true, clearToken: true }))
    .catch((err) => {
      console.warn('presence cleanup on quit failed', err && err.message)
    })
    .finally(() => {
      try { require('./syncService').stopAutoSync() } catch (e) {}
      try { updateService.stopAutoUpdateChecks() } catch (e) {}
      app.exit(0)
    })
})
