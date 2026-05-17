import { assertPermission } from '../security/currentUser.js'
import { getActiveUser } from '../security/currentUser.js'
import { ReportService } from '../services/ReportService.js'
import { SystemLogService } from '../services/SystemLogService.js'

export function registerReportHandlers(ipcMain, db) {
  const service = new ReportService(db)
  const systemLog = new SystemLogService(db)

  ipcMain.handle('reports:export-sales-excel', async (_event, filters) => {
    assertPermission('export_import')
    const result = await service.exportSalesReport(filters)
    if (result.ok) {
      systemLog.write({
        action: 'report.export_sales_excel',
        entityType: 'report',
        entityId: 'sales_excel',
        description: 'Export laporan mutasi ke Excel',
        operator: getActiveUser(),
        metadata: { filters, rowCount: result.rowCount }
      })
    }
    return result
  })
}
