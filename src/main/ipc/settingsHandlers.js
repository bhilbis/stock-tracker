import Store from 'electron-store'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { assertPermission, getActiveUser } from '../security/currentUser.js'
import { BackupService } from '../services/BackupService.js'
import { SystemLogService } from '../services/SystemLogService.js'

const require = createRequire(import.meta.url)
const { app } = require('electron')

const store = new Store({
  projectName: 'selling-apps',
  name: 'settings',
  encryptionKey: 'selling-apps-local-settings'
})

export function registerSettingsHandlers(ipcMain, db, dbPath, databaseConnection) {
  const backupService = new BackupService(store, dbPath, databaseConnection)
  const systemLog = new SystemLogService(db)

  ipcMain.handle('settings:get', () => {
    assertPermission('manage_settings')
    return {
      ...backupService.getStatus(),
      databasePath: dbPath
    }
  })

  ipcMain.handle('settings:save-google-credentials', (_event, payload) => {
    assertPermission('manage_settings')
    const result = backupService.saveCredentials(payload)
    systemLog.write({
      action: 'settings.save_google_credentials',
      entityType: 'settings',
      entityId: 'google_drive',
      description: 'Menyimpan credential Google Drive',
      operator: getActiveUser()
    })
    return result
  })

  ipcMain.handle('settings:connect-google-drive', async () => {
    assertPermission('manage_settings')
    const result = await backupService.connectGoogleDrive()
    systemLog.write({
      action: 'backup.connect_google_drive',
      entityType: 'backup',
      entityId: 'google_drive',
      description: 'Menghubungkan Google Drive',
      operator: getActiveUser()
    })
    return result
  })

  ipcMain.handle('settings:backup-now', async () => {
    assertPermission('manage_settings')
    const result = await backupService.backupNow()
    systemLog.write({
      action: 'backup.now',
      entityType: 'backup',
      entityId: result.file?.id || 'google_drive',
      description: result.mode === 'updated' ? 'Meng-update backup lama di Google Drive' : 'Membuat backup pertama di Google Drive',
      operator: getActiveUser(),
      metadata: result
    })
    return result
  })

  ipcMain.handle('settings:restore-from-drive', async () => {
    assertPermission('manage_settings')
    systemLog.write({
      action: 'backup.restore_from_drive_requested',
      entityType: 'backup',
      entityId: 'google_drive',
      description: 'Memulai restore database lokal dari backup Google Drive',
      operator: getActiveUser()
    })
    const result = await backupService.restoreFromDrive({
      beforeReplace: () => databaseConnection.close()
    })
    restartAfterRestore()
    return result
  })

  ipcMain.handle('settings:set-auto-backup', (_event, enabled) => {
    assertPermission('manage_settings')
    store.set('googleDriveBackupEnabled', Boolean(enabled))
    systemLog.write({
      action: 'settings.set_auto_backup',
      entityType: 'settings',
      entityId: 'google_drive_auto_backup',
      description: Boolean(enabled) ? 'Mengaktifkan auto-backup' : 'Menonaktifkan auto-backup',
      operator: getActiveUser(),
      metadata: { enabled: Boolean(enabled) }
    })
    return { ok: true }
  })

  return backupService
}

function restartAfterRestore() {
  if (process.env.ELECTRON_RENDERER_URL) {
    const command = process.platform === 'win32' ? 'powershell.exe' : 'sh'
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', 'Start-Sleep -Seconds 2; npm run dev']
      : ['-c', 'sleep 2; npm run dev']
    const child = spawn(command, args, {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
  } else {
    app.relaunch({ args: process.argv.slice(1) })
  }

  app.exit(0)
}
