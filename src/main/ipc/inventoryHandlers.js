import { assertAnyPermission, assertPermission, getActiveUser } from '../security/currentUser.js'
import { InventoryService } from '../services/InventoryService.js'

export function registerInventoryHandlers(ipcMain, db) {
  const service = new InventoryService(db)

  ipcMain.handle('inventory:list', () => {
    assertAnyPermission(['view_dashboard', 'manage_stock_out', 'view_logs'])
    return service.listItems()
  })

  ipcMain.handle('inventory:stock-in', (_event, payload) => {
    assertPermission('manage_stock_in')
    return service.stockIn(normalizeStockIn(payload), getActiveUser())
  })

  ipcMain.handle('inventory:update-item', (_event, payload) => {
    assertPermission('manage_stock_in')
    return service.updateItem(normalizeUpdateItem(payload), getActiveUser())
  })

  ipcMain.handle('inventory:stock-out', (_event, payload) => {
    assertPermission('manage_stock_out')
    return service.stockOut(normalizeStockOut(payload), getActiveUser())
  })

  ipcMain.handle('inventory:cancel-stock-out', (_event, payload) => {
    assertPermission('manage_stock_out')
    return service.cancelStockOut(normalizeCancelStockOut(payload), getActiveUser())
  })
}

function normalizeStockIn(payload) {
  return {
    itemCode: requiredString(payload.itemCode, 'Kode barang wajib diisi'),
    itemName: requiredString(payload.itemName, 'Nama barang wajib diisi'),
    purchasePrice: requiredNumber(payload.purchasePrice, 'Harga beli wajib valid'),
    qty: positiveInteger(payload.qty, 'Qty wajib lebih dari 0'),
    defaultSellingPrice: requiredNumber(payload.defaultSellingPrice, 'Harga jual wajib valid'),
    supplier: optionalString(payload.supplier),
    description: optionalString(payload.description),
    businessDate: requiredDate(payload.businessDate, 'Tanggal transaksi wajib valid')
  }
}

function normalizeStockOut(payload) {
  return {
    itemCode: requiredString(payload.itemCode, 'Kode barang wajib diisi'),
    qty: positiveInteger(payload.qty, 'Qty wajib lebih dari 0'),
    unitPrice: requiredNumber(payload.unitPrice, 'Harga jual wajib valid'),
    ownerName: requiredString(payload.ownerName, 'Nama pemilik toko wajib diisi'),
    storeName: optionalString(payload.storeName),
    phoneNumber: optionalString(payload.phoneNumber),
    description: optionalString(payload.description),
    businessDate: requiredDate(payload.businessDate, 'Tanggal transaksi wajib valid')
  }
}

function normalizeUpdateItem(payload) {
  return {
    itemCode: requiredString(payload.itemCode, 'Kode barang wajib diisi'),
    itemName: requiredString(payload.itemName, 'Nama barang wajib diisi'),
    purchasePrice: requiredNumber(payload.purchasePrice, 'Harga beli wajib valid'),
    defaultSellingPrice: requiredNumber(payload.defaultSellingPrice, 'Harga jual wajib valid'),
    supplier: optionalString(payload.supplier)
  }
}

function normalizeCancelStockOut(payload) {
  return {
    logId: positiveInteger(payload.logId, 'ID mutasi wajib valid'),
    reason: optionalString(payload.reason)
  }
}

function requiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredNumber(value, message) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(message)
  return Math.round(number)
}

function positiveInteger(value, message) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(message)
  return number
}

function requiredDate(value, message) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(message)
  return value
}
