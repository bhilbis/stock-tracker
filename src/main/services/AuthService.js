import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { administratorPermissions } from '../security/currentUser.js'
import { nowWibIsoString } from '../time/wib.js'

export class AuthService {
  constructor(db) {
    this.db = db
    this.ensureDefaultAdmin()
  }

  ensureDefaultAdmin() {
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
    if (existing) return

    const password = hashPassword('admin123')
    const timestamp = nowWibIsoString()

    this.db
      .prepare(`
        INSERT INTO users (
          username, name, role, password_hash, password_salt,
          permissions, created_at, updated_at
        )
        VALUES (
          'admin', 'Admin', 'administrator', @hash, @salt,
          @permissions, @timestamp, @timestamp
        )
      `)
      .run({
        hash: password.hash,
        salt: password.salt,
        permissions: JSON.stringify(administratorPermissions),
        timestamp
      })
  }

  login(username, password) {
    const user = this.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(String(username || '').trim())

    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      throw new Error('Username atau password salah')
    }

    return publicUser(user)
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return { hash, salt }
}

function verifyPassword(password, hash, salt) {
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(String(password), salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: JSON.parse(user.permissions)
  }
}
