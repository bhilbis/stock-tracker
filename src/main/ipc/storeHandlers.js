import { assertAnyPermission, assertPermission, getActiveUser } from '../security/currentUser.js'
import { StoreService } from '../services/StoreService.js'

export function registerStoreHandlers(ipcMain, db) {
  const service = new StoreService(db)

  ipcMain.handle('stores:list', () => {
    assertAnyPermission(['view_dashboard', 'manage_stock_out', 'view_logs'])
    return service.listStores()
  })

  ipcMain.handle('stores:create', (_event, payload) => {
    assertPermission('manage_stock_out')
    return service.createStore(normalizeStore(payload), getActiveUser())
  })

  ipcMain.handle('stores:detail', (_event, payload) => {
    assertAnyPermission(['manage_stock_out', 'view_logs'])
    return service.storeDetail(normalizeStoreDetail(payload))
  })

  ipcMain.handle('stores:performance', (_event, filters) => {
    assertPermission('view_dashboard')
    return service.storePerformance(filters)
  })
}

function normalizeStore(payload) {
  return {
    ownerName: requiredString(payload.ownerName, 'Nama owner wajib diisi'),
    storeName: optionalString(payload.storeName),
    phoneNumber: optionalString(payload.phoneNumber)
  }
}

function normalizeStoreDetail(payload) {
  return {
    storeId: positiveInteger(payload.storeId, 'ID toko wajib valid')
  }
}

function requiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function positiveInteger(value, message) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(message)
  return number
}
