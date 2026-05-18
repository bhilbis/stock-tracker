import ExcelJS from 'exceljs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { dialog } = require('electron')

const columnStyles = {
  tanggal: 'FFED1C24',
  jenis: 'FFE2E8F0',
  kode: 'FFFFFFFF',
  nama: 'FFFFE600',
  owner: 'FFE2E8F0',
  toko: 'FFE2E8F0',
  hBeli: 'FF70AD47',
  hJual: 'FF00B0F0',
  qty: 'FFFFC000',
  totalBeli: 'FFB565F2',
  totalJual: 'FFD9EAD3',
  laba: 'FFE6A19A'
}

export class ReportService {
  constructor(db) {
    this.db = db
  }

  async exportSalesReport(filters = {}) {
    const rows = aggregateReportRows(this.getSalesRows(filters))
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Selling Apps'
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet('Laporan Penjualan')
    worksheet.columns = [
      { header: 'TANGGAL', key: 'tanggal', width: 22 },
      { header: 'JENIS', key: 'jenis', width: 10 },
      { header: 'KODE', key: 'kode', width: 18 },
      { header: 'NAMA BARANG', key: 'nama', width: 32 },
      { header: 'OWNER', key: 'owner', width: 22 },
      { header: 'TOKO', key: 'toko', width: 22 },
      { header: 'H. BELI', key: 'hBeli', width: 14 },
      { header: 'H. JUAL', key: 'hJual', width: 14 },
      { header: 'QTY', key: 'qty', width: 10 },
      { header: 'T.H. BELI', key: 'totalBeli', width: 16 },
      { header: 'T.H. JUAL', key: 'totalJual', width: 16 },
      { header: 'LABA', key: 'laba', width: 14 }
    ]

    styleHeader(worksheet)

    rows.forEach((row) => {
      const totalBeli = row.cost_price * row.qty
      const totalJual = row.unit_price * row.qty
      worksheet.addRow({
        tanggal: row.report_date,
        jenis: row.mutation_type,
        kode: row.item_code,
        nama: row.item_name,
        owner: row.owner_name || '',
        toko: row.store_name || row.owner_name || '',
        hBeli: row.cost_price,
        hJual: row.mutation_type === 'OUT' ? row.unit_price : null,
        qty: row.qty,
        totalBeli,
        totalJual: row.mutation_type === 'OUT' ? totalJual : null,
        laba: row.mutation_type === 'OUT' ? totalJual - totalBeli : null
      })
    })

    const totalPurchase = rows.reduce((sum, row) => sum + (row.mutation_type === 'IN' ? row.cost_price * row.qty : 0), 0)
    const totalSales = rows.reduce((sum, row) => sum + (row.mutation_type === 'OUT' ? row.unit_price * row.qty : 0), 0)
    const totalProfit = rows.reduce((sum, row) => {
      if (row.mutation_type !== 'OUT') return sum
      return sum + (row.unit_price * row.qty) - (row.cost_price * row.qty)
    }, 0)
    const endingStockQty = rows.reduce((sum, row) => sum + (row.mutation_type === 'OUT' ? -row.qty : row.qty), 0)

    const totalRow = worksheet.addRow({
      nama: 'TOTAL',
      totalBeli: totalPurchase,
      totalJual: totalSales,
      laba: totalProfit
    })

    worksheet.addRow({})
    const summaryTitleRow = worksheet.addRow({ nama: 'RINGKASAN STOK' })
    summaryTitleRow.font = { bold: true }

    const summaryStartRow = worksheet.rowCount + 1
    worksheet.addRow({ nama: 'Total Stok Masuk', qty: { formula: `SUMIF(B:B,"IN",I:I)` } })
    worksheet.addRow({ nama: 'Total Stok Keluar', qty: { formula: `SUMIF(B:B,"OUT",I:I)` } })
    worksheet.addRow({ nama: 'Sisa Stok Akhir', qty: { formula: `SUMIF(B:B,"IN",I:I)-SUMIF(B:B,"OUT",I:I)`, result: endingStockQty } })

    for (let rowNumber = summaryStartRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      row.font = { bold: rowNumber === worksheet.rowCount }
    }

    worksheet.eachRow((row, rowNumber) => {
      row.height = rowNumber === 1 ? 24 : 20
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
        cell.alignment = { vertical: 'middle' }
      })
    })

    totalRow.font = { bold: true }
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    })

    ;['G', 'H', 'J', 'K', 'L'].forEach((column) => {
      worksheet.getColumn(column).numFmt = '#,##0'
    })

    const defaultPath = `laporan-penjualan-${filters.fromDate || 'awal'}-${filters.toDate || 'akhir'}.xlsx`
    const result = await dialog.showSaveDialog({
      title: 'Simpan Laporan Excel',
      defaultPath,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    })

    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    await workbook.xlsx.writeFile(result.filePath)
    return { ok: true, filePath: result.filePath, rowCount: rows.length }
  }

  getSalesRows(filters) {
    const conditions = []
    const params = {}

    conditions.push('stock_logs.canceled_at IS NULL')

    if (filters.mutationType && filters.mutationType !== 'ALL') {
      conditions.push('stock_logs.mutation_type = @mutationType')
      params.mutationType = filters.mutationType
    }

    if (filters.fromDate) {
      conditions.push('COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) >= @fromDate')
      params.fromDate = filters.fromDate
    }

    if (filters.toDate) {
      conditions.push('COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) <= @toDate')
      params.toDate = filters.toDate
    }

    if (filters.storeId && filters.storeId !== 'ALL') {
      conditions.push('stock_logs.store_id = @storeId')
      params.storeId = Number(filters.storeId)
    }

    if (filters.search) {
      conditions.push(`(
        stock_logs.item_code LIKE @search OR
        inventory.item_name LIKE @search OR
        stores.owner_name LIKE @search OR
        stores.store_name LIKE @search
      )`)
      params.search = `%${filters.search}%`
    }

    return this.db
      .prepare(`
        SELECT
          stock_logs.*,
          COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) AS report_date,
          inventory.item_name,
          stores.owner_name,
          stores.store_name
        FROM stock_logs
        LEFT JOIN inventory ON inventory.item_code = stock_logs.item_code
        LEFT JOIN stores ON stores.id = stock_logs.store_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY report_date ASC, stock_logs.created_at ASC, stock_logs.id ASC
      `)
      .all(params)
  }
}

function styleHeader(worksheet) {
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FF111827' } }
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.columns.forEach((column) => {
    const cell = worksheet.getCell(`${column.letter}1`)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: columnStyles[column.key] }
    }
  })
}

function aggregateReportRows(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const key = [
      row.report_date,
      row.mutation_type,
      row.item_code,
      row.item_name,
      row.cost_price,
      row.mutation_type === 'OUT' ? row.unit_price : '',
      row.owner_name || '',
      row.store_name || row.owner_name || ''
    ].join('|')

    const existing = grouped.get(key)
    if (existing) {
      existing.qty += row.qty
      continue
    }

    grouped.set(key, { ...row })
  }

  return Array.from(grouped.values())
}
