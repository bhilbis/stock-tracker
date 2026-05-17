export function hasAnyPermission(user, permissions = []) {
  if (!user) return false
  if (user.role === 'administrator') return true
  return permissions.some((permission) => user.permissions.includes(permission))
}
