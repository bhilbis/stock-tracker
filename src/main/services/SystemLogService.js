import { nowWibIsoString } from '../time/wib.js'

export class SystemLogService {
  constructor(db) {
    this.db = db
  }

  write({ action, entityType = null, entityId = null, description = null, operator = null, metadata = null }) {
    this.db
      .prepare(`
        INSERT INTO system_logs (
          action, entity_type, entity_id, description,
          operator_name, operator_role, metadata, created_at
        )
        VALUES (
          @action, @entityType, @entityId, @description,
          @operatorName, @operatorRole, @metadata, @createdAt
        )
      `)
      .run({
        action,
        entityType,
        entityId,
        description,
        operatorName: operator?.name || null,
        operatorRole: operator?.role || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: nowWibIsoString()
      })
  }

  list(filters = {}) {
    const conditions = []
    const params = {}

    if (filters.fromDate) {
      conditions.push('created_at >= @fromDate')
      params.fromDate = `${filters.fromDate} 00:00:00+07:00`
    }

    if (filters.toDate) {
      conditions.push('created_at <= @toDate')
      params.toDate = `${filters.toDate} 23:59:59+07:00`
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    return this.db
      .prepare(`
        SELECT *
        FROM system_logs
        ${where}
        ORDER BY created_at DESC, id DESC
      `)
      .all(params)
  }
}
