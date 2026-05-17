import { assertPermission } from '../security/currentUser.js'
import { LogService } from '../services/LogService.js'
import { SystemLogService } from '../services/SystemLogService.js'

export function registerLogHandlers(ipcMain, db) {
  const service = new LogService(db)
  const systemLogService = new SystemLogService(db)

  ipcMain.handle('logs:list', (_event, filters) => {
    assertPermission('view_logs')
    return service.listLogs(filters)
  })

  ipcMain.handle('logs:export-ready', () => {
    assertPermission('export_import')
    return { ok: true }
  })

  ipcMain.handle('system-logs:list', (_event, filters) => {
    assertPermission('view_logs')
    return systemLogService.list(filters)
  })
}
