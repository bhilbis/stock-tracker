import { hasAnyPermission } from '../state/currentUser.js'

export function PermissionGate({ allowedPermissions, children, renderProps = false, user }) {
  const allowed = hasAnyPermission(user, allowedPermissions)

  if (renderProps) {
    return children({
      allowed,
      disabled: !allowed,
      tooltip: allowed ? undefined : 'Akses Ditolak'
    })
  }

  if (!allowed) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-ui border border-ui-border bg-ui-surface p-8 text-center shadow-ui">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Akses Ditolak</h2>
          <p className="text-ui-muted">Akun Anda tidak memiliki izin untuk membuka halaman ini.</p>
        </div>
      </div>
    )
  }

  return children
}
