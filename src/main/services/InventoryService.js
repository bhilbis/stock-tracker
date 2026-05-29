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
          isi_per_kardus = @qtyPerBox,
          base_unit = @baseUnit,
          box_unit = @boxUnit,
          qty_per_box = @qtyPerBox,
          updated_at = @timestamp
        WHERE item_code = @itemCode
      `)
      .run({
        ...payload,
        supplier: payload.supplier || null,
        qtyPerBox: payload.qtyPerBox || 1,
        baseUnit: payload.baseUnit || 'PCS',
        boxUnit: payload.boxUnit || 'KARDUS',
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

    const boxUnit = payload.boxUnit || 'KARDUS'
    const qtyPerBox = payload.qtyPerBox || 1
    const isBoxUnit = payload.inputUnit === boxUnit
    const baseQty = isBoxUnit ? payload.inputQty * qtyPerBox : payload.inputQty
    const buyPricePerBase = Math.round(isBoxUnit ? payload.buyPrice / qtyPerBox : payload.buyPrice)
    const sellPricePerBase = Math.round(isBoxUnit ? payload.defaultSellingPrice / qtyPerBox : payload.defaultSellingPrice)

    const mutation = this.db.transaction(() => {
      const existingItem = this.db
        .prepare('SELECT item_code FROM inventory WHERE item_code = ?')
        .get(payload.itemCode)

      this.db
        .prepare(`
          INSERT INTO inventory (
            item_code, item_name, current_stock, purchase_price,
            default_selling_price, supplier,
            isi_per_kardus, base_unit, box_unit, qty_per_box,
            created_at, updated_at
          )
          VALUES (
            @itemCode, @itemName, @baseQty, @buyPricePerBase,
            @sellPricePerBase, @supplier,
            @qtyPerBox, @baseUnit, @boxUnit, @qtyPerBox,
            @timestamp, @timestamp
          )
          ON CONFLICT(item_code) DO UPDATE SET
            item_name = excluded.item_name,
            current_stock = inventory.current_stock + excluded.current_stock,
            purchase_price = excluded.purchase_price,
            default_selling_price = excluded.default_selling_price,
            supplier = excluded.supplier,
            isi_per_kardus = excluded.isi_per_kardus,
            base_unit = excluded.base_unit,
            box_unit = excluded.box_unit,
            qty_per_box = excluded.qty_per_box,
            updated_at = excluded.updated_at
        `)
        .run({
          itemCode: payload.itemCode,
          itemName: payload.itemName,
          baseQty,
          buyPricePerBase,
          sellPricePerBase,
          supplier: payload.supplier || null,
          qtyPerBox,
          baseUnit: payload.baseUnit || 'PCS',
          boxUnit,
          timestamp
        })

      const stockLog = this.db
        .prepare(`
          INSERT INTO stock_logs (
            item_code, mutation_type,
            qty, cost_price, unit_price,
            input_qty, input_unit, base_qty, buy_price_per_base,
            description, operator_name, operator_role,
            business_date, unit_type, created_at
          )
          VALUES (
            @itemCode, 'IN',
            @baseQty, @buyPricePerBase, @sellPricePerBase,
            @inputQty, @inputUnit, @baseQty, @buyPricePerBase,
            @description, @operatorName, @operatorRole,
            @businessDate, @inputUnit, @timestamp
          )
        `)
        .run({
          itemCode: payload.itemCode,
          baseQty,
          buyPricePerBase,
          sellPricePerBase,
          inputQty: payload.inputQty,
          inputUnit: payload.inputUnit,
          description: payload.description || null,
          operatorName: operator.name,
          operatorRole: operator.role,
          businessDate,
          timestamp
        })

      this.db
        .prepare(`
          INSERT INTO inventory_lots (
            item_code, source_log_id, purchase_price, qty_initial,
            qty_remaining, business_date, created_at
          )
          VALUES (
            @itemCode, @sourceLogId, @buyPricePerBase, @baseQty,
            @baseQty, @businessDate, @timestamp
          )
        `)
        .run({
          itemCode: payload.itemCode,
          sourceLogId: stockLog.lastInsertRowid,
          buyPricePerBase,
          baseQty,
          businessDate,
          timestamp
        })

      this.systemLog.write({
        action: existingItem ? 'inventory.stock_in_existing' : 'inventory.stock_in_new',
        entityType: 'inventory',
        entityId: payload.itemCode,
        description: existingItem
          ? 'Menambahkan stok ke barang yang sudah ada'
          : 'Membuat barang baru dan menambahkan stok',
        operator,
        metadata: { inputQty: payload.inputQty, inputUnit: payload.inputUnit, baseQty, businessDate }
      })
    })

    mutation()
    return { ok: true }
  }

  stockOut(payload, operator) {
    const timestamp = nowWibIsoString()
    const businessDate = payload.businessDate || timestamp.slice(0, 10)
    const stockOutItems = payload.items || [{
      itemCode: payload.itemCode,
      inputQty: payload.inputQty,
      inputUnit: payload.inputUnit,
      sellPrice: payload.sellPrice
    }]
    let result

    const mutation = this.db.transaction(() => {
      const storeId = this.getOrCreateStockOutStore(payload, timestamp)

      const processedItems = stockOutItems.map((stockOutItem) => this.writeStockOutItem({
        stockOutItem,
        storeId,
        description: payload.description,
        businessDate,
        timestamp,
        operator
      }))

      this.systemLog.write({
        action: 'inventory.stock_out',
        entityType: 'inventory',
        entityId: stockOutItems.map((item) => item.itemCode).join(', '),
        description: stockOutItems.length > 1
          ? 'Mengurangi stok untuk mutasi keluar multi item'
          : 'Mengurangi stok untuk mutasi keluar',
        operator,
        metadata: {
          items: stockOutItems.map((item) => ({ itemCode: item.itemCode, inputQty: item.inputQty, inputUnit: item.inputUnit })),
          storeId,
          businessDate
        }
      })

      result = {
        ok: true,
        itemCount: processedItems.length,
        remainingStocks: processedItems.map((item) => ({
          itemCode: item.itemCode,
          remainingStock: item.remainingStock
        }))
      }
    })

    mutation()
    return result
  }

  getOrCreateStockOutStore(payload, timestamp) {
    if (payload.storeId) {
      const store = this.db
        .prepare('SELECT id FROM stores WHERE id = @storeId')
        .get({ storeId: payload.storeId })

      if (!store) throw new Error('Toko tidak ditemukan')
      return store.id
    }

    const store = this.db
      .prepare(`
        SELECT id
        FROM stores
        WHERE owner_name = @ownerName
          AND COALESCE(store_name, '') = COALESCE(@storeName, '')
          AND COALESCE(phone_number, '') = COALESCE(@phoneNumber, '')
        ORDER BY id ASC
        LIMIT 1
      `)
      .get({
        ownerName: payload.ownerName,
        storeName: payload.storeName || null,
        phoneNumber: payload.phoneNumber || null
      })

    if (store) return store.id

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

    return result.lastInsertRowid
  }

  writeStockOutItem({ stockOutItem, storeId, description, businessDate, timestamp, operator }) {
    const item = this.db
      .prepare('SELECT * FROM inventory WHERE item_code = ?')
      .get(stockOutItem.itemCode)

    if (!item) throw new Error(`Barang ${stockOutItem.itemCode} tidak ditemukan`)

    const boxUnit = item.box_unit || 'KARDUS'
    const qtyPerBox = item.qty_per_box || item.isi_per_kardus || 1
    const isBoxUnit = stockOutItem.inputUnit === boxUnit
    const baseQty = isBoxUnit ? stockOutItem.inputQty * qtyPerBox : stockOutItem.inputQty
    const sellPricePerBase = Math.round(isBoxUnit ? stockOutItem.sellPrice / qtyPerBox : stockOutItem.sellPrice)

    if (item.current_stock < baseQty) {
      throw new Error(`Stok ${item.item_name} tidak mencukupi (tersedia: ${item.current_stock} ${item.base_unit || 'PCS'})`)
    }

    this.db
      .prepare(`
        UPDATE inventory
        SET current_stock = current_stock - @qty, updated_at = @timestamp
        WHERE item_code = @itemCode
      `)
      .run({ itemCode: stockOutItem.itemCode, qty: baseQty, timestamp })

    let remainingQty = baseQty
    let cogsTotal = 0
    const lotConsumptions = []

    const lots = this.db
      .prepare(`
        SELECT *
        FROM inventory_lots
        WHERE item_code = @itemCode AND qty_remaining > 0
        ORDER BY business_date ASC, created_at ASC, id ASC
      `)
      .all({ itemCode: stockOutItem.itemCode })

    for (const lot of lots) {
      if (remainingQty <= 0) break
      const usedQty = Math.min(remainingQty, lot.qty_remaining)

      this.db
        .prepare('UPDATE inventory_lots SET qty_remaining = qty_remaining - @usedQty WHERE id = @id')
        .run({ usedQty, id: lot.id })

      cogsTotal += usedQty * lot.purchase_price
      lotConsumptions.push({ lotId: lot.id, qtyConsumed: usedQty })
      remainingQty -= usedQty
    }

    if (remainingQty > 0) throw new Error(`Stok lot ${item.item_name} tidak mencukupi`)

    const avgCostPerBase = baseQty > 0 ? Math.round(cogsTotal / baseQty) : 0

    const stockLog = this.db
      .prepare(`
        INSERT INTO stock_logs (
          item_code, store_id, mutation_type,
          qty, cost_price, unit_price,
          input_qty, input_unit, base_qty, sell_price_per_base, cogs_total,
          description, operator_name, operator_role,
          business_date, unit_type, created_at
        )
        VALUES (
          @itemCode, @storeId, 'OUT',
          @baseQty, @avgCostPerBase, @sellPricePerBase,
          @inputQty, @inputUnit, @baseQty, @sellPricePerBase, @cogsTotal,
          @description, @operatorName, @operatorRole,
          @businessDate, @inputUnit, @timestamp
        )
      `)
      .run({
        itemCode: stockOutItem.itemCode,
        storeId,
        baseQty,
        avgCostPerBase,
        sellPricePerBase,
        inputQty: stockOutItem.inputQty,
        inputUnit: stockOutItem.inputUnit,
        cogsTotal,
        description: description || null,
        operatorName: operator.name,
        operatorRole: operator.role,
        businessDate,
        timestamp
      })

    const logId = stockLog.lastInsertRowid
    for (const consumption of lotConsumptions) {
      this.db
        .prepare(`
          INSERT INTO lot_consumptions (log_id, lot_id, qty_consumed)
          VALUES (@logId, @lotId, @qtyConsumed)
        `)
        .run({ logId, lotId: consumption.lotId, qtyConsumed: consumption.qtyConsumed })
    }

    return {
      itemCode: stockOutItem.itemCode,
      remainingStock: item.current_stock - baseQty
    }
  }

  cancelStockOut(payload, operator) {
    const timestamp = nowWibIsoString()
    let result

    const mutation = this.db.transaction(() => {
      const log = this.db
        .prepare('SELECT * FROM stock_logs WHERE id = @logId')
        .get({ logId: payload.logId })

      if (!log) throw new Error('Mutasi tidak ditemukan')
      if (log.mutation_type !== 'OUT') throw new Error('Hanya mutasi OUT yang bisa dibatalkan')
      if (log.canceled_at) throw new Error('Mutasi ini sudah dibatalkan')

      const restoredQty = log.base_qty || log.qty

      this.db
        .prepare(`
          UPDATE inventory
          SET current_stock = current_stock + @qty, updated_at = @timestamp
          WHERE item_code = @itemCode
        `)
        .run({ qty: restoredQty, itemCode: log.item_code, timestamp })

      const consumptions = this.db
        .prepare('SELECT * FROM lot_consumptions WHERE log_id = @logId')
        .all({ logId: payload.logId })

      if (consumptions.length > 0) {
        for (const consumption of consumptions) {
          this.db
            .prepare('UPDATE inventory_lots SET qty_remaining = qty_remaining + @qty WHERE id = @lotId')
            .run({ qty: consumption.qty_consumed, lotId: consumption.lot_id })
        }
      } else if (log.source_lot_id) {
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
        metadata: { itemCode: log.item_code, qty: restoredQty, reason: payload.reason || null }
      })

      result = { ok: true, restoredQty, itemCode: log.item_code }
    })

    mutation()
    return result
  }

  getLotHistory(itemCode) {
    const item = this.db
      .prepare('SELECT * FROM inventory WHERE item_code = ?')
      .get(itemCode)

    if (!item) throw new Error('Barang tidak ditemukan')

    const lots = this.db
      .prepare(`
        SELECT
          il.id,
          il.qty_initial,
          il.qty_remaining,
          il.purchase_price,
          il.source_log_id,
          COALESCE(sl.business_date, substr(il.created_at, 1, 10)) AS arrival_date,
          il.created_at,
          sl.unit_price AS sell_price_at_receipt,
          sl.sell_price_per_base,
          sl.input_qty,
          sl.input_unit
        FROM inventory_lots il
        LEFT JOIN stock_logs sl ON il.source_log_id = sl.id
        WHERE il.item_code = @itemCode
        ORDER BY arrival_date ASC, il.id ASC
      `)
      .all({ itemCode })

    return { item, lots }
  }
}
