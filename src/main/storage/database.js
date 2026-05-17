import Database from 'better-sqlite3'
import { join } from 'node:path'

export function initializeDatabase(userDataPath) {
  const db = new Database(join(userDataPath, 'data.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      item_code TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      current_stock INTEGER NOT NULL DEFAULT 0,
      purchase_price INTEGER NOT NULL DEFAULT 0,
      default_selling_price INTEGER NOT NULL DEFAULT 0,
      supplier TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_name TEXT NOT NULL,
      store_name TEXT,
      phone_number TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      store_id INTEGER,
      mutation_type TEXT NOT NULL CHECK (mutation_type IN ('IN', 'OUT')),
      qty INTEGER NOT NULL CHECK (qty > 0),
      cost_price INTEGER NOT NULL DEFAULT 0,
      unit_price INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      operator_name TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      business_date TEXT,
      canceled_at TEXT,
      canceled_by TEXT,
      cancel_reason TEXT,
      source_lot_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_code) REFERENCES inventory(item_code),
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_logs_created_at ON stock_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_logs_mutation_type ON stock_logs(mutation_type);
    CREATE INDEX IF NOT EXISTS idx_stock_logs_store_id ON stock_logs(store_id);

    CREATE TABLE IF NOT EXISTS inventory_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      source_log_id INTEGER,
      purchase_price INTEGER NOT NULL DEFAULT 0,
      qty_initial INTEGER NOT NULL DEFAULT 0,
      qty_remaining INTEGER NOT NULL DEFAULT 0,
      business_date TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_code) REFERENCES inventory(item_code),
      FOREIGN KEY (source_log_id) REFERENCES stock_logs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_code ON inventory_lots(item_code);
    CREATE INDEX IF NOT EXISTS idx_inventory_lots_remaining ON inventory_lots(item_code, qty_remaining);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      permissions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      description TEXT,
      operator_name TEXT,
      operator_role TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_system_logs_action ON system_logs(action);
  `)

  runMigrations(db)

  return {
    db,
    dbPath: join(userDataPath, 'data.sqlite')
  }
}

function runMigrations(db) {
  const stockLogColumns = db.prepare('PRAGMA table_info(stock_logs)').all()
  if (!stockLogColumns.some((column) => column.name === 'business_date')) {
    db.exec('ALTER TABLE stock_logs ADD COLUMN business_date TEXT')
    db.exec("UPDATE stock_logs SET business_date = substr(created_at, 1, 10) WHERE business_date IS NULL")
  }

  const refreshedStockLogColumns = db.prepare('PRAGMA table_info(stock_logs)').all()
  if (!refreshedStockLogColumns.some((column) => column.name === 'canceled_at')) {
    db.exec('ALTER TABLE stock_logs ADD COLUMN canceled_at TEXT')
  }
  if (!refreshedStockLogColumns.some((column) => column.name === 'canceled_by')) {
    db.exec('ALTER TABLE stock_logs ADD COLUMN canceled_by TEXT')
  }
  if (!refreshedStockLogColumns.some((column) => column.name === 'cancel_reason')) {
    db.exec('ALTER TABLE stock_logs ADD COLUMN cancel_reason TEXT')
  }
  if (!refreshedStockLogColumns.some((column) => column.name === 'source_lot_id')) {
    db.exec('ALTER TABLE stock_logs ADD COLUMN source_lot_id INTEGER')
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_logs_business_date ON stock_logs(business_date)')
  backfillInventoryLots(db)
}

function backfillInventoryLots(db) {
  const lotCount = db.prepare('SELECT COUNT(*) AS count FROM inventory_lots').get().count
  if (lotCount > 0) return

  const logs = db
    .prepare(`
      SELECT *
      FROM stock_logs
      WHERE canceled_at IS NULL
      ORDER BY COALESCE(business_date, substr(created_at, 1, 10)) ASC, created_at ASC, id ASC
    `)
    .all()

  const migrate = db.transaction(() => {
    for (const log of logs) {
      const businessDate = log.business_date || log.created_at.slice(0, 10)
      if (log.mutation_type === 'IN') {
        db.prepare(`
          INSERT INTO inventory_lots (
            item_code, source_log_id, purchase_price, qty_initial,
            qty_remaining, business_date, created_at
          )
          VALUES (
            @itemCode, @sourceLogId, @purchasePrice, @qtyInitial,
            @qtyRemaining, @businessDate, @createdAt
          )
        `).run({
          itemCode: log.item_code,
          sourceLogId: log.id,
          purchasePrice: log.cost_price,
          qtyInitial: log.qty,
          qtyRemaining: log.qty,
          businessDate,
          createdAt: log.created_at
        })
      }

      if (log.mutation_type === 'OUT') {
        let remaining = log.qty
        const consumptions = []
        const lots = db
          .prepare(`
            SELECT *
            FROM inventory_lots
            WHERE item_code = @itemCode AND qty_remaining > 0
            ORDER BY business_date ASC, created_at ASC, id ASC
          `)
          .all({ itemCode: log.item_code })

        for (const lot of lots) {
          if (remaining <= 0) break
          const usedQty = Math.min(remaining, lot.qty_remaining)
          db.prepare('UPDATE inventory_lots SET qty_remaining = qty_remaining - @usedQty WHERE id = @id')
            .run({ usedQty, id: lot.id })
          consumptions.push({
            lotId: lot.id,
            qty: usedQty,
            purchasePrice: lot.purchase_price
          })
          remaining -= usedQty
        }

        if (consumptions.length > 0) {
          const [firstConsumption, ...extraConsumptions] = consumptions
          db.prepare(`
            UPDATE stock_logs
            SET qty = @qty,
                cost_price = @costPrice,
                source_lot_id = @sourceLotId
            WHERE id = @id
          `).run({
            qty: firstConsumption.qty,
            costPrice: firstConsumption.purchasePrice,
            sourceLotId: firstConsumption.lotId,
            id: log.id
          })

          for (const consumption of extraConsumptions) {
            db.prepare(`
              INSERT INTO stock_logs (
                item_code, store_id, mutation_type, qty, cost_price, unit_price,
                description, operator_name, operator_role, business_date,
                source_lot_id, created_at
              )
              VALUES (
                @itemCode, @storeId, 'OUT', @qty, @costPrice, @unitPrice,
                @description, @operatorName, @operatorRole, @businessDate,
                @sourceLotId, @createdAt
              )
            `).run({
              itemCode: log.item_code,
              storeId: log.store_id,
              qty: consumption.qty,
              costPrice: consumption.purchasePrice,
              unitPrice: log.unit_price,
              description: log.description,
              operatorName: log.operator_name,
              operatorRole: log.operator_role,
              businessDate,
              sourceLotId: consumption.lotId,
              createdAt: log.created_at
            })
          }
        }
      }
    }
  })

  migrate()
}
