export class LogService {
  constructor(db) {
    this.db = db
  }

  listLogs(filters = {}) {
    const conditions = ['stock_logs.canceled_at IS NULL']
    const params = {}

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
        stores.store_name LIKE @search OR
        stores.phone_number LIKE @search
      )`)
      params.search = `%${filters.search}%`
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    return this.db
      .prepare(`
        SELECT
          stock_logs.*,
          COALESCE(stock_logs.business_date, substr(stock_logs.created_at, 1, 10)) AS display_date,
          inventory.item_name,
          stores.owner_name,
          stores.store_name,
          stores.phone_number
        FROM stock_logs
        LEFT JOIN inventory ON inventory.item_code = stock_logs.item_code
        LEFT JOIN stores ON stores.id = stock_logs.store_id
        ${where}
        ORDER BY stock_logs.created_at DESC, stock_logs.id DESC
      `)
      .all(params)
  }
}
