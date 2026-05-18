import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { contextBridge, ipcRenderer } = require('electron')

const channels = {
  auth: {
    session: 'auth:session',
    login: 'auth:login',
    logout: 'auth:logout'
  },
  inventory: {
    list: 'inventory:list',
    updateItem: 'inventory:update-item',
    stockIn: 'inventory:stock-in',
    stockOut: 'inventory:stock-out',
    cancelStockOut: 'inventory:cancel-stock-out'
  },
  logs: {
    list: 'logs:list',
    exportReady: 'logs:export-ready',
    systemList: 'system-logs:list'
  },
  settings: {
    get: 'settings:get',
    saveGoogleCredentials: 'settings:save-google-credentials',
    connectGoogleDrive: 'settings:connect-google-drive',
    backupNow: 'settings:backup-now',
    restoreFromDrive: 'settings:restore-from-drive',
    setAutoBackup: 'settings:set-auto-backup'
  },
  reports: {
    exportSalesExcel: 'reports:export-sales-excel'
  },
  stores: {
    list: 'stores:list',
    create: 'stores:create',
    detail: 'stores:detail',
    performance: 'stores:performance'
  }
}

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload)
}

contextBridge.exposeInMainWorld('api', {
  auth: {
    session: () => invoke(channels.auth.session),
    login: (payload) => invoke(channels.auth.login, payload),
    logout: () => invoke(channels.auth.logout)
  },
  inventory: {
    list: () => invoke(channels.inventory.list),
    updateItem: (payload) => invoke(channels.inventory.updateItem, payload),
    stockIn: (payload) => invoke(channels.inventory.stockIn, payload),
    stockOut: (payload) => invoke(channels.inventory.stockOut, payload),
    cancelStockOut: (payload) => invoke(channels.inventory.cancelStockOut, payload)
  },
  logs: {
    list: (filters) => invoke(channels.logs.list, filters),
    exportReady: () => invoke(channels.logs.exportReady),
    systemList: (filters) => invoke(channels.logs.systemList, filters)
  },
  settings: {
    get: () => invoke(channels.settings.get),
    saveGoogleCredentials: (payload) => invoke(channels.settings.saveGoogleCredentials, payload),
    connectGoogleDrive: () => invoke(channels.settings.connectGoogleDrive),
    backupNow: () => invoke(channels.settings.backupNow),
    restoreFromDrive: () => invoke(channels.settings.restoreFromDrive),
    setAutoBackup: (enabled) => invoke(channels.settings.setAutoBackup, enabled)
  },
  reports: {
    exportSalesExcel: (filters) => invoke(channels.reports.exportSalesExcel, filters)
  },
  stores: {
    list: () => invoke(channels.stores.list),
    create: (payload) => invoke(channels.stores.create, payload),
    detail: (payload) => invoke(channels.stores.detail, payload),
    performance: (filters) => invoke(channels.stores.performance, filters)
  }
})
