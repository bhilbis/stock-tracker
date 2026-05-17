import { AuthService } from '../services/AuthService.js'
import { SystemLogService } from '../services/SystemLogService.js'
import { clearActiveUser, getActiveUser, setActiveUser } from '../security/currentUser.js'

export function registerAuthHandlers(ipcMain, db) {
  const service = new AuthService(db)
  const systemLog = new SystemLogService(db)

  ipcMain.handle('auth:session', () => getActiveUser())

  ipcMain.handle('auth:login', (_event, payload) => {
    const user = service.login(payload?.username, payload?.password)
    setActiveUser(user)
    systemLog.write({
      action: 'auth.login',
      entityType: 'user',
      entityId: user.username,
      description: 'User login',
      operator: user
    })
    return user
  })

  ipcMain.handle('auth:logout', () => {
    const user = getActiveUser()
    if (user) {
      systemLog.write({
        action: 'auth.logout',
        entityType: 'user',
        entityId: user.username,
        description: 'User logout',
        operator: user
      })
    }
    clearActiveUser()
    return { ok: true }
  })
}
