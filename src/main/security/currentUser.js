export const administratorPermissions = [
  'view_dashboard',
  'manage_stock_in',
  'manage_stock_out',
  'view_logs',
  'export_import',
  'manage_settings'
]

let activeUser = null

export function setActiveUser(user) {
  activeUser = user
}

export function clearActiveUser() {
  activeUser = null
}

export function getActiveUser() {
  return activeUser
}

export function hasPermission(permission) {
  if (!activeUser) return false
  if (activeUser.role === 'administrator') return true
  return activeUser.permissions.includes(permission)
}

export function assertPermission(permission) {
  if (!activeUser) {
    const error = new Error('Silakan login terlebih dahulu')
    error.code = 'ERR_UNAUTHENTICATED'
    throw error
  }

  if (!hasPermission(permission)) {
    const error = new Error('Akses Ditolak')
    error.code = 'ERR_PERMISSION_DENIED'
    throw error
  }
}

export function assertAnyPermission(permissions) {
  if (!activeUser) {
    const error = new Error('Silakan login terlebih dahulu')
    error.code = 'ERR_UNAUTHENTICATED'
    throw error
  }

  if (!permissions.some((permission) => hasPermission(permission))) {
    const error = new Error('Akses Ditolak')
    error.code = 'ERR_PERMISSION_DENIED'
    throw error
  }
}
