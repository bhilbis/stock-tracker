import { nowWibIsoString } from '../time/wib.js'
import { SystemLogService } from './SystemLogService.js'

export class InventoryService {
  constructor(db) {
    this.db = db
    this.systemLog = new SystemLogService(db)
  }

  listItems() {
    return this.db
      .prepare('SELECT * FROM inventory ORDER BY item_name COLLATE NOCASE ASC')
      .all()
  }

  updateItem(payload, operator) {
    const timestamp = nowWibIsoString()
    const result = this.db
      .prepare(`
        UPDATE inventory
        SET
          item_name = @itemName,
          purchase_price = @purchasePrice,
          default_selling_price = @defaultSellingPrice,
          supplier = @supplier,
          updated_at = @timestamp
        WHERE item_code = @itemCode
      `)
      .run({
        ...payload,
        supplier: payload.supplier || null,
        timestamp
      })

    if (result.changes === 0) throw new Error('Barang tidak ditemukan')

    this.systemLog.write({
      action: 'inventory.update_item',
      entityType: 'inventory',
      entityId: payload.itemCode,
      description: 'Mengubah data barang',
      operator,
      metadata: payload
    })

    return { ok: true }
  }

  stockIn(payload, operator) {
    const timestamp = nowWibIsoString()
    const businessDate = payload.businessDate || timestamp.slice(0, 10)
    const mutation = this.db.transaction(() => {
      const existingItem = this.db
        .prepare('SELECT item_code FROM inventory WHERE item_code = ?')
        .get(payload.itemCode)

      this.db
        .prepare(`
          INSERT INTO inventory (
            item_code, item_name, current_stock, purchase_price,
            default_selling_price, supplier, created_at, updated_at
          )
          VALUES (
            @itemCode, @itemName, @qty, @purchasePrice,
            @defaultSellingPrice, @supplier, @timestamp, @timestamp
          )
          ON CONFLICT(item_code) DO UPDATE SET
            item_name = excluded.item_name,
            current_stock = inventory.current_stock + excluded.current_stock,
            purchase_price = excluded.purchase_price,
            default_selling_price = excluded.default_selling_price,
            supplier = excluded.supplier,
            updated_at = excluded.updated_at
        `)
        .run({ ...payload, timestamp, supplier: payload.supplier || null })

      const stockLog = this.db
        .prepare(`
          INSERT INTO stock_logs (
            item_code, mutation_type, qty, cost_price, unit_price,
            description, operator_name, operator_role, business_date, created_at
          )
          VALUES (
            @itemCode, 'IN', @qty, @purchasePrice, @defaultSellingPrice,
            @description, @operatorName, @operatorRole, @businessDate, @timestamp
          )
        `)
        .run({
          ...payload,
          timestamp,
          businessDate,
          description: payload.description || null,
          operatorName: operator.name,
          operatorRole: operator.role
        })

      this.db
        .prepare(`
          INSERT INTO inventory_lots (
            item_code, source_log_id, purchase_price, qty_initial,
            qty_remaining, business_date, created_at
          )
          VALUES (
            @itemCode, @sourceLogId, @purchasePrice, @qty,
            @qty, @businessDate, @timestamp
          )
        `)
        .run({
          itemCode: payload.itemCode,
          sourceLogId: stockLog.lastInsertRowid,
          purchasePrice: payload.purchasePrice,
          qty: payload.qty,
          businessDate,
          timestamp
        })

      this.systemLog.write({
        action: existingItem ? 'inventory.stock_in_existing' : 'inventory.stock_in_new',
        entityType: 'inventory',
        entityId: payload.itemCode,
        description: existingItem ? 'Menambahkan stok ke barang yang sudah ada' : 'Membuat barang baru dan menambahkan stok',
        operator,
        metadata: { qty: payload.qty, businessDate }
      })
    })

    mutation()
    return { ok: true }
  }

  stockOut(payload, operator) {
    const timestamp = nowWibIsoString()
    const businessDate = payload.businessDate || timestamp.slice(0, 10)
    let result
    const mutation = this.db.transaction(() => {
      const item = this.db
        .prepare('SELECT * FROM inventory WHERE item_code = ?')
        .get(payload.itemCode)

      if (!item) throw new Error('Barang tidak ditemukan')
      if (item.current_stock < payload.qty) throw new Error('Stok tidak mencukupi')

      const store = this.db
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

      this.db
        .prepare(`
          UPDATE inventory
          SET current_stock = current_stock - @qty, updated_at = @timestamp
          WHERE item_code = @itemCode
        `)
        .run({ itemCode: payload.itemCode, qty: payload.qty, timestamp })

      let remainingQty = payload.qty
      const lots = this.db
        .prepare(`
          SELECT *
          FROM inventory_lots
          WHERE item_code = @itemCode AND qty_remaining > 0
          ORDER BY business_date ASC, created_at ASC, id ASC
        `)
        .all({ itemCode: payload.itemCode })

      for (const lot of lots) {
        if (remainingQty <= 0) break
        const usedQty = Math.min(remainingQty, lot.qty_remaining)

        this.db
          .prepare('UPDATE inventory_lots SET qty_remaining = qty_remaining - @usedQty WHERE id = @lotId')
          .run({ usedQty, lotId: lot.id })

        this.db
          .prepare(`
            INSERT INTO stock_logs (
              item_code, store_id, mutation_type, qty, cost_price, unit_price,
              description, operator_name, operator_role, business_date, source_lot_id, created_at
            )
            VALUES (
              @itemCode, @storeId, 'OUT', @qty, @costPrice, @unitPrice,
              @description, @operatorName, @operatorRole, @businessDate, @sourceLotId, @timestamp
            )
          `)
          .run({
            itemCode: payload.itemCode,
            storeId: store.lastInsertRowid,
            qty: usedQty,
            costPrice: lot.purchase_price,
            unitPrice: payload.unitPrice,
            description: payload.description || null,
            operatorName: operator.name,
            operatorRole: operator.role,
            businessDate,
            sourceLotId: lot.id,
            timestamp
          })

        remainingQty -= usedQty
      }

      if (remainingQty > 0) throw new Error('Stok lot tidak mencukupi')

      this.systemLog.write({
        action: 'inventory.stock_out',
        entityType: 'inventory',
        entityId: payload.itemCode,
        description: 'Mengurangi stok untuk mutasi keluar',
        operator,
        metadata: { qty: payload.qty, storeId: store.lastInsertRowid, businessDate }
      })

      result = {
        ok: true,
        remainingStock: item.current_stock - payload.qty
      }
    })

    mutation()
    return result
  }

  cancelStockOut(payload, operator) {
    const timestamp = nowWibIsoString()
    let result
    const mutation = this.db.transaction(() => {
      const log = this.db
        .prepare(`
          SELECT *
          FROM stock_logs
          WHERE id = @logId
        `)
        .get({ logId: payload.logId })

      if (!log) throw new Error('Mutasi tidak ditemukan')
      if (log.mutation_type !== 'OUT') throw new Error('Hanya mutasi OUT yang bisa dibatalkan')
      if (log.canceled_at) throw new Error('Mutasi ini sudah dibatalkan')

      this.db
        .prepare(`
          UPDATE inventory
          SET current_stock = current_stock + @qty, updated_at = @timestamp
          WHERE item_code = @itemCode
        `)
        .run({
          qty: log.qty,
          itemCode: log.item_code,
          timestamp
        })

      if (log.source_lot_id) {
        this.db
          .prepare('UPDATE inventory_lots SET qty_remaining = qty_remaining + @qty WHERE id = @lotId')
          .run({ qty: log.qty, lotId: log.source_lot_id })
      }

      this.db
        .prepare(`
          UPDATE stock_logs
          SET canceled_at = @timestamp,
              canceled_by = @operatorName,
              cancel_reason = @reason
          WHERE id = @logId
        `)
        .run({
          timestamp,
          operatorName: operator.name,
          reason: payload.reason || null,
          logId: payload.logId
        })

      this.systemLog.write({
        action: 'inventory.cancel_stock_out',
        entityType: 'stock_logs',
        entityId: String(payload.logId),
        description: 'Membatalkan mutasi keluar dan mengembalikan stok gudang',
        operator,
        metadata: { itemCode: log.item_code, qty: log.qty, reason: payload.reason || null }
      })

      result = { ok: true, restoredQty: log.qty, itemCode: log.item_code }
    })

    mutation()
    return result
  }
}
