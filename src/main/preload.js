const { contextBridge, ipcRenderer } = require('electron')

// Expose a minimal, stable API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  auth: {
    login: (username, password, role, rememberMe) => ipcRenderer.invoke('auth:login', { username, password, role, rememberMe }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    getRemembered: () => ipcRenderer.invoke('auth:getRemembered')
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
    forceSync: () => ipcRenderer.invoke('sync:force'),
    checkConnectivity: () => ipcRenderer.invoke('sync:status')
  },
  email: {
    sendReport: (payload) => ipcRenderer.invoke('email:send-report', payload)
  },
  smtp: {
    setPassword: (password) => ipcRenderer.invoke('smtp:setPassword', password),
    hasPassword: () => ipcRenderer.invoke('smtp:hasPassword')
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
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getApiEndpoint: () => ipcRenderer.invoke('settings:getApiEndpoint'),
    testConnection: () => ipcRenderer.invoke('settings:testConnection')
  },
  updater: {
    check: (manual) => ipcRenderer.invoke('updater:check', !!manual),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    isEnabled: () => ipcRenderer.invoke('updater:isEnabled')
  },
  toast: (message, level = 'info') => ipcRenderer.send('ui:toast', { message, level }),
  on: (channel, cb) => {
    const allowed = ['app:ready', 'sync:status', 'ui:toast', 'auth:session-revoked', 'updater:status']
    if (!allowed.includes(channel)) return
    ipcRenderer.on(channel, (e, ...args) => cb(...args))
  }
})
