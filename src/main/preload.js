const { contextBridge, ipcRenderer } = require('electron')

// Expose a minimal, stable API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  auth: {
    login: (username, password, role) => ipcRenderer.invoke('auth:login', { username, password, role }),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  db: {
    getSummary: () => ipcRenderer.invoke('db:get-summary'),
    getTransactions: (opts) => ipcRenderer.invoke('db:get-transactions', opts),
    addTransaction: (tx) => ipcRenderer.invoke('db:add-transaction', tx),
    updateTransaction: (id, updates) => ipcRenderer.invoke('db:update-transaction', id, updates),
    deleteTransaction: (id) => ipcRenderer.invoke('db:delete-transaction', id),
    deleteTestData: () => ipcRenderer.invoke('db:delete-test-data'),

  },
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:status'),
    forceSync: () => ipcRenderer.invoke('sync:force')
  },
  email: {
    sendReport: (payload) => ipcRenderer.invoke('email:send-report', payload)
  },
  staff: {
    list: (opts) => ipcRenderer.invoke('staff:list', opts),
    create: (payload) => ipcRenderer.invoke('staff:create', payload),
    update: (id, payload) => ipcRenderer.invoke('staff:update', id, payload),
    delete: (id) => ipcRenderer.invoke('staff:delete', id)
  },
  pdf: {
    saveTransaction: (tx) => ipcRenderer.invoke('pdf:save-transaction', tx)
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },
  toast: (message, level = 'info') => ipcRenderer.send('ui:toast', { message, level }),
  on: (channel, cb) => {
    const allowed = ['app:ready', 'sync:status', 'ui:toast']
    if (!allowed.includes(channel)) return
    ipcRenderer.on(channel, (e, ...args) => cb(...args))
  }
})
