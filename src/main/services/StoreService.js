import { nowWibIsoString } from '../time/wib.js'
import { SystemLogService } from './SystemLogService.js'

export class StoreService {
  constructor(db) {
    this.db = db
    this.systemLog = new SystemLogService(db)
  }

  listStores() {
    return this.db
      .prepare(`
        SELECT stores.*,
          COALESCE(SUM(CASE WHEN stock_logs.mutation_type = 'OUT' AND stock_logs.canceled_at IS NULL THEN stock_logs.qty ELSE 0 END), 0) AS total_qty_out,
          COALESCE(SUM(CASE WHEN stock_logs.mutation_type = 'OUT' AND stock_logs.canceled_at IS NULL THEN stock_logs.qty * stock_logs.unit_price ELSE 0 END), 0) AS total_turnover
        FROM stores
        LEFT JOIN stock_logs ON stock_logs.store_id = stores.id
        GROUP BY stores.id
        ORDER BY stores.owner_name COLLATE NOCASE ASC, stores.store_name COLLATE NOCASE ASC
      `)
      .all()
  }

  createStore(payload, operator) {
    const timestamp = nowWibIsoString()
    const result = this.db
      .prepare(`
        INSERT INTO stores (owner_name, store_name, phone_number, created_at, updated_at)
        VALUES (@ownerName, @storeName, @phoneNumber, @timestamp, @timestamp)
      `)
      .run({
        ownerName: payload.ownerName,
        storeName: payload.storeName || null,
        phoneNumber: payload.phoneNumber || null,
        timestamp
      })

    this.systemLog.write({
      action: 'store.create',
      entityType: 'store',
      entityId: String(result.lastInsertRowid),
      description: 'Menambahkan data toko',
      operator,
      metadata: payload
    })

    return { ok: true, id: result.lastInsertRowid }
  }

  storeDetail(payload) {
    const store = this.db
      .prepare('SELECT * FROM stores WHERE id = @storeId')
      .get({ storeId: payload.storeId })

    if (!store) throw new Error('Toko tidak ditemukan')

    const logs = this.db
      .prepare(`
        SELECT
          stock_logs.*,
          COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) AS display_date,
          inventory.item_name
        FROM stock_logs
        LEFT JOIN inventory ON inventory.item_code = stock_logs.item_code
        WHERE stock_logs.store_id = @storeId
          AND stock_logs.mutation_type = 'OUT'
          AND stock_logs.canceled_at IS NULL
        ORDER BY display_date DESC, stock_logs.created_at DESC, stock_logs.id DESC
      `)
      .all({ storeId: payload.storeId })

    return { store, logs }
  }

  storePerformance(filters = {}) {
    const conditions = ["stock_logs.mutation_type = 'OUT'"]
    conditions.push('stock_logs.canceled_at IS NULL')
    const params = {}

    if (filters.fromDate) {
      conditions.push('COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) >= @fromDate')
      params.fromDate = filters.fromDate
    }

    if (filters.toDate) {
      conditions.push('COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) <= @toDate')
      params.toDate = filters.toDate
    }

    return this.db
      .prepare(`
        SELECT
          COALESCE(stores.store_name, stores.owner_name, 'Tanpa Toko') AS store_label,
          COALESCE(SUM(stock_logs.qty), 0) AS qty,
          COALESCE(SUM(stock_logs.qty * stock_logs.unit_price), 0) AS turnover
        FROM stock_logs
        LEFT JOIN stores ON stores.id = stock_logs.store_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY stores.id
        ORDER BY qty DESC, turnover DESC
        LIMIT 10
      `)
      .all(params)
  }
}
