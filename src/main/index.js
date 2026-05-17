import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeDatabase } from './storage/database.js'
import { registerAuthHandlers } from './ipc/authHandlers.js'
import { registerInventoryHandlers } from './ipc/inventoryHandlers.js'
import { registerLogHandlers } from './ipc/logHandlers.js'
import { registerReportHandlers } from './ipc/reportHandlers.js'
import { registerSettingsHandlers } from './ipc/settingsHandlers.js'
import { registerStoreHandlers } from './ipc/storeHandlers.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
const { app, BrowserWindow, ipcMain } = require('electron')

let mainWindow
let backupService
let databaseConnection

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f8fb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (process.env.ELECTRON_RENDERER_URL) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Renderer failed to load: ${errorCode} ${errorDescription}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const database = initializeDatabase(app.getPath('userData'))
  const { db, dbPath } = database
  databaseConnection = db

  registerAuthHandlers(ipcMain, db)
  registerInventoryHandlers(ipcMain, db)
  registerLogHandlers(ipcMain, db)
  registerReportHandlers(ipcMain, db)
  registerStoreHandlers(ipcMain, db)
  backupService = registerSettingsHandlers(ipcMain, db, dbPath, databaseConnection)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (event) => {
  if (!backupService?.getStatus().googleDriveBackupEnabled) return

  event.preventDefault()
  try {
    await backupService.backupNow()
  } finally {
    app.exit(0)
  }
})
