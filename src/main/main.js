const { app, BrowserWindow } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('./ipcHandlers')
const { initDatabase } = require('./database')
const authService = require('./authService')

function createWindow () {
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

  win.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'))
  win.once('ready-to-show', () => {
    // show window (do not auto-open DevTools in normal runs)
    win.show()
  })
  return win
}

app.whenReady().then(async () => {
  try {
    await initDatabase()
    await authService.initAuth()

  } catch (err) {
    console.error('DB init failed', err)
  }

  registerIpcHandlers()
  let win = createWindow()

  // Live-reload in development: watch renderer files and reload window on change
  if (!app.isPackaged) {
    try {
      const fs = require('fs')
      const watchPath = path.join(__dirname, '..', 'renderer')
      let reloadTimer = null
      fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        // debounce rapid changes
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => {
          try {
            if (win && !win.isDestroyed()) {
              console.log('[dev] file changed, reloading renderer:', filename)
              win.webContents.reloadIgnoringCache()
            }
          } catch (e) {
            console.warn('[dev] reload failed', e)
          }
        }, 150)
      })
    } catch (e) {
      console.warn('Live-reload watcher not available', e)
    }
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
// (duplicate block removed)
