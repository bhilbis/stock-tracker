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

  ipcMain.handle('inventory:lot-history', (_event, itemCode) => {
    assertAnyPermission(['view_dashboard', 'manage_stock_in', 'manage_stock_out'])
    if (typeof itemCode !== 'string' || !itemCode.trim()) throw new Error('Kode barang wajib diisi')
    return service.getLotHistory(itemCode.trim())
  })
}

function normalizeStockIn(payload) {
  return {
    itemCode: requiredString(payload.itemCode, 'Kode barang wajib diisi'),
    itemName: requiredString(payload.itemName, 'Nama barang wajib diisi'),
    inputQty: positiveInteger(payload.inputQty ?? payload.qty, 'Qty wajib lebih dari 0'),
    inputUnit: requiredString(payload.inputUnit ?? payload.unitType ?? 'PCS', 'Satuan wajib diisi'),
    buyPrice: requiredNumber(payload.buyPrice ?? payload.purchasePrice, 'Harga beli wajib valid'),
    defaultSellingPrice: requiredNumber(payload.defaultSellingPrice, 'Harga jual wajib valid'),
    baseUnit: requiredString(payload.baseUnit || 'PCS', 'Satuan dasar wajib diisi'),
    boxUnit: requiredString(payload.boxUnit || 'KARDUS', 'Satuan kardus wajib diisi'),
    qtyPerBox: positiveInteger(payload.qtyPerBox || 1, 'Isi per kardus wajib lebih dari 0'),
    supplier: optionalString(payload.supplier),
    description: optionalString(payload.description),
    businessDate: requiredDate(payload.businessDate, 'Tanggal transaksi wajib valid')
  }
}

function normalizeStockOut(payload) {
  const items = Array.isArray(payload.items) && payload.items.length
    ? payload.items.map(normalizeStockOutItem)
    : [normalizeStockOutItem(payload)]

  const itemCodes = new Set()
  for (const item of items) {
    if (itemCodes.has(item.itemCode)) throw new Error('Barang yang sama tidak boleh dipilih lebih dari sekali')
    itemCodes.add(item.itemCode)
  }

  const storeId = payload.storeId ? positiveInteger(payload.storeId, 'Toko wajib valid') : null

  return {
    items,
    storeId,
    ownerName: storeId ? optionalString(payload.ownerName) : requiredString(payload.ownerName, 'Nama pemilik toko wajib diisi'),
    storeName: optionalString(payload.storeName),
    phoneNumber: optionalString(payload.phoneNumber),
    description: optionalString(payload.description),
    businessDate: requiredDate(payload.businessDate, 'Tanggal transaksi wajib valid')
  }
}

function normalizeStockOutItem(item) {
  return {
    itemCode: requiredString(item.itemCode, 'Kode barang wajib diisi'),
    inputQty: positiveInteger(item.inputQty ?? item.qty, 'Qty wajib lebih dari 0'),
    sellPrice: requiredNumber(item.sellPrice ?? item.unitPrice, 'Harga jual wajib valid'),
    inputUnit: requiredString(item.inputUnit ?? item.unitType ?? 'PCS', 'Satuan wajib diisi')
  }
}

function normalizeUpdateItem(payload) {
  return {
    itemCode: requiredString(payload.itemCode, 'Kode barang wajib diisi'),
    itemName: requiredString(payload.itemName, 'Nama barang wajib diisi'),
    purchasePrice: requiredNumber(payload.purchasePrice, 'Harga beli wajib valid'),
    defaultSellingPrice: requiredNumber(payload.defaultSellingPrice, 'Harga jual wajib valid'),
    supplier: optionalString(payload.supplier),
    baseUnit: requiredString(payload.baseUnit || 'PCS', 'Satuan dasar wajib diisi'),
    boxUnit: requiredString(payload.boxUnit || 'KARDUS', 'Satuan kardus wajib diisi'),
    qtyPerBox: positiveInteger(payload.qtyPerBox || 1, 'Isi per kardus wajib lebih dari 0')
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
