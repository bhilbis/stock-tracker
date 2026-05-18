import { copyFileSync, createReadStream, createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import Database from 'better-sqlite3'
import { google } from 'googleapis'

const require = createRequire(import.meta.url)
const { shell } = require('electron')

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const BACKUP_FILE_NAME = 'selling-apps-data.sqlite'
const REDIRECT_PORT = 53682
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const REQUIRED_TABLES = ['inventory', 'stores', 'stock_logs', 'inventory_lots', 'users', 'system_logs']

export class BackupService {
  constructor(store, dbPath, databaseConnection) {
    this.store = store
    this.dbPath = dbPath
    this.databaseConnection = databaseConnection
  }

  getStatus() {
    return {
      googleDriveBackupEnabled: this.store.get('googleDriveBackupEnabled', false),
      hasGoogleRefreshToken: Boolean(this.store.get('googleRefreshToken')),
      googleClientId: this.store.get('googleClientId', ''),
      googleClientSecret: this.store.get('googleClientSecret', '')
    }
  }

  saveCredentials(payload) {
    this.store.set('googleClientId', String(payload.clientId || '').trim())
    this.store.set('googleClientSecret', String(payload.clientSecret || '').trim())
    return this.getStatus()
  }

  async connectGoogleDrive() {
    const oauth2Client = this.createOAuthClient()
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE]
    })

    const codePromise = waitForOAuthCode()
    await shell.openExternal(authUrl)
    const code = await codePromise
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      throw new Error('Google tidak mengirim refresh token. Coba koneksi ulang dan pilih consent.')
    }

    this.store.set('googleRefreshToken', tokens.refresh_token)
    this.store.set('googleDriveBackupEnabled', true)
    return this.getStatus()
  }

  async backupNow() {
    const oauth2Client = this.createOAuthClient()
    oauth2Client.setCredentials({ refresh_token: this.store.get('googleRefreshToken') })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const existingFileId = await this.findExistingBackupFile(drive)
    const snapshot = await this.createBackupSnapshot()

    try {
      const media = {
        mimeType: 'application/x-sqlite3',
        body: createReadStream(snapshot.path)
      }

      if (existingFileId) {
        const response = await drive.files.update({
          fileId: existingFileId,
          media,
          fields: 'id,name,modifiedTime,size'
        })
        return { ok: true, mode: 'updated', file: response.data, snapshotSize: snapshot.size }
      }

      const response = await drive.files.create({
        requestBody: {
          name: BACKUP_FILE_NAME,
          parents: ['appDataFolder']
        },
        media,
        fields: 'id,name,modifiedTime,size'
      })

      return { ok: true, mode: 'created', file: response.data, snapshotSize: snapshot.size }
    } finally {
      if (snapshot.temporary && existsSync(snapshot.path)) unlinkSync(snapshot.path)
    }
  }

  async restoreFromDrive({ beforeReplace } = {}) {
    const oauth2Client = this.createOAuthClient()
    oauth2Client.setCredentials({ refresh_token: this.store.get('googleRefreshToken') })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const existingFileId = await this.findExistingBackupFile(drive)

    if (!existingFileId) {
      throw new Error('File backup belum ditemukan di Google Drive')
    }

    const dbDir = dirname(this.dbPath)
    const tempPath = join(dbDir, 'data.restore.tmp.sqlite')
    const localBackupPath = join(dbDir, `data.before-restore-${Date.now()}.sqlite`)
    const response = await drive.files.get(
      { fileId: existingFileId, alt: 'media' },
      { responseType: 'stream' }
    )

    await pipeline(response.data, createWriteStream(tempPath))
    this.validateRestoredDatabase(tempPath)

    if (beforeReplace) beforeReplace()

    if (existsSync(this.dbPath)) copyFileSync(this.dbPath, localBackupPath)
    if (existsSync(this.dbPath)) unlinkSync(this.dbPath)
    renameSync(tempPath, this.dbPath)

    ;['-wal', '-shm'].forEach((suffix) => {
      const sidecarPath = `${this.dbPath}${suffix}`
      if (existsSync(sidecarPath)) unlinkSync(sidecarPath)
    })

    return { ok: true, restoredFromFileId: existingFileId, localBackupPath }
  }

  async findExistingBackupFile(drive) {
    const response = await drive.files.list({
      spaces: 'appDataFolder',
      q: `name='${BACKUP_FILE_NAME}' and trashed=false`,
      fields: 'files(id,name,modifiedTime)',
      pageSize: 1
    })

    return response.data.files?.[0]?.id || null
  }

  createOAuthClient() {
    const clientId = this.store.get('googleClientId')
    const clientSecret = this.store.get('googleClientSecret')

    if (!clientId || !clientSecret) {
      throw new Error('Google Client ID dan Client Secret wajib diisi di Pengaturan')
    }

    return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  }

  async createBackupSnapshot() {
    if (!existsSync(this.dbPath)) {
      throw new Error('Database lokal tidak ditemukan untuk backup')
    }

    const snapshotPath = join(dirname(this.dbPath), `data.backup-${Date.now()}.tmp.sqlite`)

    if (this.databaseConnection?.backup) {
      await this.databaseConnection.backup(snapshotPath)
      const size = statSync(snapshotPath).size
      if (size <= 0) throw new Error('Snapshot backup database kosong')
      return { path: snapshotPath, temporary: true, size }
    }

    if (this.databaseConnection?.pragma) {
      this.databaseConnection.pragma('wal_checkpoint(FULL)')
    }

    const size = statSync(this.dbPath).size
    if (size <= 0) throw new Error('Database lokal kosong')
    return { path: this.dbPath, temporary: false, size }
  }

  validateRestoredDatabase(filePath) {
    if (!existsSync(filePath) || statSync(filePath).size <= 0) {
      throw new Error('File restore dari Google Drive kosong atau tidak valid')
    }

    const restoredDb = new Database(filePath, { readonly: true, fileMustExist: true })
    try {
      const quickCheck = restoredDb.pragma('quick_check', { simple: true })
      if (quickCheck !== 'ok') {
        throw new Error(`Validasi SQLite gagal: ${quickCheck}`)
      }

      const tables = new Set(
        restoredDb
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name)
      )
      const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table))
      if (missingTables.length > 0) {
        throw new Error(`File restore tidak sesuai schema aplikasi. Tabel hilang: ${missingTables.join(', ')}`)
      }
    } finally {
      restoredDb.close()
    }
  }
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    let settled = false
    let serverListening = false
    let timeoutId
    const server = createServer((request, response) => {
      const url = new URL(request.url, REDIRECT_URI)

      if (url.pathname !== '/oauth2callback') {
        response.writeHead(404)
        response.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(createOAuthSuccessPage())

      finish(code ? null : new Error('Kode OAuth tidak ditemukan'), code)
    })

    function finish(error, code) {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (serverListening) server.close()
      if (error) reject(error)
      else resolve(code)
    }

    timeoutId = setTimeout(() => {
      finish(new Error('Login Google Drive dibatalkan atau timeout. Coba hubungkan ulang.'))
    }, OAUTH_TIMEOUT_MS)

    server.on('error', (error) => finish(error))
    server.on('close', () => {
      serverListening = false
    })
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      serverListening = true
    })
  })
}

function createOAuthSuccessPage() {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Google Drive Terhubung</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7fb;
        color: #172033;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(39, 111, 191, 0.12), transparent 32rem),
          linear-gradient(135deg, #f9fbff 0%, #eef3f8 100%);
      }

      main {
        width: min(100%, 440px);
        border: 1px solid #dde4ee;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 24px 70px rgba(30, 45, 70, 0.14);
        padding: 32px;
        text-align: center;
      }

      .icon {
        width: 64px;
        height: 64px;
        margin: 0 auto 20px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #e9f7ef;
        color: #12843b;
      }

      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
        font-weight: 700;
      }

      p {
        margin: 12px 0 0;
        color: #637083;
        line-height: 1.6;
        font-size: 15px;
      }

      .status {
        margin-top: 24px;
        padding: 12px 14px;
        border-radius: 10px;
        background: #f1f5f9;
        color: #334155;
        font-size: 14px;
      }

      strong {
        color: #172033;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="icon" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1>Google Drive Terhubung</h1>
      <p>Otorisasi berhasil. Silakan kembali ke aplikasi Selling Apps untuk melanjutkan backup.</p>
      <div class="status">Tab ini akan tertutup otomatis dalam <strong id="countdown">5</strong> detik.</div>
    </main>
    <script>
      let remaining = 5;
      const countdown = document.getElementById('countdown');
      const timer = setInterval(() => {
        remaining -= 1;
        countdown.textContent = remaining;
        if (remaining <= 0) {
          clearInterval(timer);
          window.close();
          setTimeout(() => {
            document.querySelector('.status').textContent = 'Jika tab belum tertutup, Anda boleh menutupnya secara manual.';
          }, 500);
        }
      }, 1000);
    </script>
  </body>
</html>`
}
