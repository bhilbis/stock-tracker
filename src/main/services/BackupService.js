import { copyFileSync, createReadStream, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { google } from 'googleapis'

const require = createRequire(import.meta.url)
const { shell } = require('electron')

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const BACKUP_FILE_NAME = 'selling-apps-data.sqlite'
const REDIRECT_PORT = 53682
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`

export class BackupService {
  constructor(store, dbPath) {
    this.store = store
    this.dbPath = dbPath
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
    const media = {
      mimeType: 'application/x-sqlite3',
      body: createReadStream(this.dbPath)
    }

    if (existingFileId) {
      const response = await drive.files.update({
        fileId: existingFileId,
        media,
        fields: 'id,name,modifiedTime'
      })
      return { ok: true, mode: 'updated', file: response.data }
    }

    const response = await drive.files.create({
      requestBody: {
        name: BACKUP_FILE_NAME,
        parents: ['appDataFolder']
      },
      media,
      fields: 'id,name,modifiedTime'
    })

    return { ok: true, mode: 'created', file: response.data }
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
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url, REDIRECT_URI)

      if (url.pathname !== '/oauth2callback') {
        response.writeHead(404)
        response.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<h1>Google Drive terhubung.</h1><p>Silakan kembali ke aplikasi Selling Apps.</p>')
      server.close()

      if (!code) reject(new Error('Kode OAuth tidak ditemukan'))
      else resolve(code)
    })

    server.on('error', reject)
    server.listen(REDIRECT_PORT, '127.0.0.1')
  })
}
