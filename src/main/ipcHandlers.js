const { ipcMain } = require('electron')
const authService = require('./authService')
const db = require('./database')
const syncService = require('./syncService')

function registerIpcHandlers () {
  ipcMain.handle('auth:login', async (event, { username, password }) => {
    try {
      console.log('auth:login attempt for', username)
      const user = await authService.verifyUser(username, password)
      if (!user) {
        console.log('auth:login failed for', username)
        return { success: false, error: 'Invalid credentials' }
      }
      console.log('auth:login success for', username)
      return { success: true, user }
    } catch (err) {
      console.error('auth:login error', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('db:get-summary', async () => {
    return await db.getSummary()
  })

  ipcMain.handle('db:get-transactions', async (event, opts = {}) => {
    return await db.getTransactions(opts)
  })

  ipcMain.handle('db:add-transaction', async (event, tx) => {
    return await db.addTransaction(tx)
  })

  ipcMain.handle('db:update-transaction', async (event, id, updates) => {
    return await db.updateTransaction(id, updates)
  })

  ipcMain.handle('db:delete-transaction', async (event, id) => {
    return await db.deleteTransaction(id)
  })

  ipcMain.handle('sync:status', async () => {
    return await syncService.getStatus()
  })

  ipcMain.handle('sync:force', async () => {
    return await syncService.forceSync()
  })
}

module.exports = { registerIpcHandlers }

