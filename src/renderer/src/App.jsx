import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Boxes,
  CloudUpload,
  Download,
  FileSpreadsheet,
  Eye,
  Loader2,
  LogOut,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Store,
  Settings,
  Trash2,
  X,
  Upload
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from './components/ui/Button.jsx'
import { Card } from './components/ui/Card.jsx'
import { Input } from './components/ui/Input.jsx'
import { Select } from './components/ui/Select.jsx'
import { Table } from './components/ui/Table.jsx'
import { Textarea } from './components/ui/Textarea.jsx'
import { PermissionGate } from './components/PermissionGate.jsx'
import trackerLogo from './assets/tracker.png'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, permission: 'view_dashboard' },
  { id: 'inventory', label: 'Stok Gudang', icon: PackageSearch, permission: 'view_dashboard' },
  { id: 'stores', label: 'Toko', icon: Store, permission: 'manage_stock_out' },
  { id: 'logs', label: 'Mutasi Stok', icon: Boxes, permission: 'view_logs' },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'manage_settings' }
]

const initialFilters = {
  mutationType: 'ALL',
  fromDate: '',
  toDate: '',
  search: '',
  storeId: 'ALL'
}

export function App() {
  const [user, setUser] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [loadingSession, setLoadingSession] = useState(true)
  const [toasts, setToasts] = useState([])
  const [confirmDialog, setConfirmDialog] = useState(null)

  function notify(type, message) {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((items) => [...items, { id, type, message }])
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id))
    }, 3500)
  }

  function requestConfirm(options) {
    return new Promise((resolve) => {
      setConfirmDialog({
        ...options,
        onResolve: resolve
      })
    })
  }

  function closeConfirm(result) {
    if (confirmDialog?.onResolve) confirmDialog.onResolve(result)
    setConfirmDialog(null)
  }

  useEffect(() => {
    window.api.auth.session().then(setUser).finally(() => setLoadingSession(false))
  }, [])

  if (loadingSession) {
    return <ShellLoader />
  }

  if (!user) {
    return (
      <>
        <LoginPage onLogin={setUser} onNotify={notify} />
        <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
        {confirmDialog ? <ConfirmDialog dialog={confirmDialog} onClose={closeConfirm} /> : null}
      </>
    )
  }

  const activeItem = navItems.find((item) => item.id === activePage) || navItems[0]

  return (
    <main className="min-h-screen bg-ui-bg text-ui-text">
      <aside className="border-b border-ui-border bg-ui-surface px-4 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
        <div className="flex items-center gap-3">
          <img src={trackerLogo} alt="Tracker" className="h-10 w-10 rounded-ui object-contain" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Selling Apps</h1>
            <p className="text-sm text-ui-muted">Manajemen stok lokal</p>
          </div>
        </div>

        <nav className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon
            const selected = activePage === item.id
            return (
              <PermissionGate key={item.id} user={user} allowedPermissions={[item.permission]} renderProps>
                {({ disabled, tooltip }) => (
                  <Button
                    variant={selected ? 'primary' : 'ghost'}
                    className="shrink-0 justify-start lg:w-full"
                    disabled={disabled}
                    title={tooltip}
                    onClick={() => setActivePage(item.id)}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Button>
                )}
              </PermissionGate>
            )
          })}
        </nav>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] lg:mt-auto lg:block lg:space-y-3">
          <div className="rounded-ui border border-ui-border bg-ui-bg p-3 text-sm">
            <p className="font-medium">{user.name}</p>
            <p className="text-ui-muted">{user.role}</p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={async () => {
              await window.api.auth.logout()
              setUser(null)
            }}
          >
            <LogOut size={18} />
            Logout
          </Button>
        </div>
      </aside>

      <section className="p-4 sm:p-6 lg:ml-64 lg:p-8">
        <PermissionGate user={user} allowedPermissions={[activeItem.permission]}>
          <PageRouter activePage={activePage} onNavigate={setActivePage} onNotify={notify} onConfirm={requestConfirm} />
        </PermissionGate>
      </section>
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      {confirmDialog ? <ConfirmDialog dialog={confirmDialog} onClose={closeConfirm} /> : null}
    </main>
  )
}

function ShellLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-ui-bg text-ui-text">
      <Card className="w-96 text-center">
        <p className="font-medium">Memuat aplikasi...</p>
      </Card>
    </main>
  )
}

function LoginPage({ onLogin, onNotify }) {
  const [form, setForm] = useState({ username: 'admin', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = await window.api.auth.login(form)
      onLogin(user)
      onNotify('success', 'Login berhasil.')
    } catch (err) {
      const message = getUserErrorMessage(err)
      setError(message)
      onNotify('error', message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ui-bg px-6 text-ui-text">
      <Card className="w-full max-w-md">
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-1">
            <img src={trackerLogo} alt="Tracker" className="mb-2 h-12 w-12 rounded-ui object-contain" />
            <h1 className="text-2xl font-semibold">Login Admin</h1>
            <p className="text-sm text-ui-muted">Masuk untuk mengelola stok dan laporan.</p>
          </div>
          <Field label="Username">
            <Input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </Field>
          {error ? <p className="text-sm text-brand-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? 'Memproses...' : 'Login'}
          </Button>
          <p className="text-xs text-ui-muted">Default awal : admin / admin123</p>
        </form>
      </Card>
    </main>
  )
}

function PageRouter({ activePage, onNavigate, onNotify, onConfirm }) {
  if (activePage === 'inventory') return <InventoryPage onNotify={onNotify} />
  if (activePage === 'stores') return <StoresPage onNotify={onNotify} />
  if (activePage === 'logs') return <LogsPage onNavigate={onNavigate} onNotify={onNotify} onConfirm={onConfirm} />
  if (activePage === 'settings') return <SettingsPage onNotify={onNotify} onConfirm={onConfirm} />
  return <DashboardPage />
}

function InventoryPage({ onNotify }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showStockIn, setShowStockIn] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  async function loadItems() {
    setItems(await window.api.inventory.list())
  }

  useEffect(() => {
    loadItems()
  }, [])

  const filteredItems = items.filter((item) => {
    const keyword = search.toLowerCase()
    return (
      item.item_code.toLowerCase().includes(keyword) ||
      item.item_name.toLowerCase().includes(keyword) ||
      String(item.supplier || '').toLowerCase().includes(keyword)
    )
  })

  const columns = [
    { key: 'item_code', header: 'Kode' },
    { key: 'item_name', header: 'Nama Barang' },
    { key: 'current_stock', header: 'Stok' },
    { key: 'purchase_price', header: 'Harga Beli', render: (row) => formatRupiah(row.purchase_price) },
    { key: 'default_selling_price', header: 'Harga Jual', render: (row) => formatRupiah(row.default_selling_price) },
    { key: 'supplier', header: 'Supplier', render: (row) => row.supplier || '-' },
    { key: 'updated_at', header: 'Update Terakhir' },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setEditingItem(row)}>
          Edit
        </Button>
      )
    }
  ]

  return (
    <div className="space-y-6">
      <PageTitle title="Stok Gudang" description="Daftar barang dan sisa stok terbaru di gudang." />
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field label="Cari Barang">
            <Input
              placeholder="Cari kode, nama barang, atau supplier"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Button onClick={() => setShowStockIn(true)}>
            <Download size={18} />
            Tambah Stok
          </Button>
          <Button variant="secondary" onClick={loadItems}>
            Refresh
          </Button>
        </div>
      </Card>
      <Table columns={columns} rows={filteredItems} getRowKey={(row) => row.item_code} emptyMessage="Belum ada data stok gudang." />
      {showStockIn ? (
        <StockInModal
          onNotify={onNotify}
          onClose={() => setShowStockIn(false)}
          onSaved={async () => {
            setShowStockIn(false)
            await loadItems()
          }}
        />
      ) : null}
      {editingItem ? (
        <EditItemModal
          item={editingItem}
          onNotify={onNotify}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            setEditingItem(null)
            await loadItems()
          }}
        />
      ) : null}
    </div>
  )
}

function DashboardPage() {
  const [periodMode, setPeriodMode] = useState('daily')
  const [customRange, setCustomRange] = useState(() => getDashboardPeriodRange('daily'))
  const [logs, setLogs] = useState([])
  const [storePerformance, setStorePerformance] = useState([])
  const [items, setItems] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const periodRange = periodMode === 'custom' ? customRange : getDashboardPeriodRange(periodMode)
  const periodFilters = { fromDate: periodRange.fromDate, toDate: periodRange.toDate }

  async function loadDashboard() {
    setLoading(true)
    try {
      const [nextLogs, nextStorePerformance, nextItems, nextStores] = await Promise.all([
        window.api.logs.list({ mutationType: 'ALL', ...periodFilters }),
        window.api.stores.performance(periodFilters),
        window.api.inventory.list(),
        window.api.stores.list()
      ])
      setLogs(nextLogs)
      setStorePerformance(nextStorePerformance)
      setItems(nextItems)
      setStores(nextStores)
    } catch {
      setLogs([])
      setStorePerformance([])
      setItems([])
      setStores([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [periodMode, customRange.fromDate, customRange.toDate])

  const summary = useMemo(() => buildSummary(logs, items), [logs, items])
  const periodLabel = formatPeriodLabel(periodRange)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Dashboard" description={`Ringkasan stok masuk, stok keluar, dan omzet. ${periodLabel}`} />
        <Button variant="ghost" onClick={loadDashboard} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <Field label="Periode Dashboard">
            <Select value={periodMode} onChange={(event) => setPeriodMode(event.target.value)}>
              <option value="daily">Harian</option>
              <option value="weekly">Mingguan</option>
              <option value="monthly">Bulanan</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="Dari Tanggal">
            <Input
              type="date"
              disabled={periodMode !== 'custom'}
              value={periodRange.fromDate}
              onChange={(event) => setCustomRange((range) => ({ ...range, fromDate: event.target.value }))}
            />
          </Field>
          <Field label="Sampai Tanggal">
            <Input
              type="date"
              disabled={periodMode !== 'custom'}
              value={periodRange.toDate}
              onChange={(event) => setCustomRange((range) => ({ ...range, toDate: event.target.value }))}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={periodMode !== 'custom'}
            onClick={() => setCustomRange(getDashboardPeriodRange('daily'))}
          >
            Hari Ini
          </Button>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Barang Masuk" value={summary.totalIn} />
        <MetricCard label="Barang Keluar" value={summary.totalOut} />
        <MetricCard label="Estimasi Omzet" value={formatRupiah(summary.turnover)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Estimasi Laba" value={formatRupiah(summary.profit)} compact />
        <MetricCard label="SKU Bergerak" value={summary.activeSku} compact />
        <MetricCard label="Total Toko" value={stores.length} compact />
        <MetricCard label="Stok Gudang" value={summary.stockOnHand} compact />
      </div>
      <Card>
        <div className="space-y-4">
          <h3 className="font-semibold">Tren Barang Keluar Harian</h3>
          <ChartFrame loading={loading} empty={summary.chartRows.length === 0} emptyMessage="Belum ada mutasi keluar untuk ditampilkan.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.chartRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="qty" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="space-y-4">
            <h3 className="font-semibold">Performa Toko Teratas</h3>
            <ChartFrame loading={loading} empty={storePerformance.length === 0} emptyMessage="Belum ada performa toko untuk ditampilkan.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storePerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="store_label" />
                  <YAxis />
                  <Tooltip formatter={(value, name) => (name === 'turnover' ? formatRupiah(value) : value)} />
                  <Bar dataKey="qty" fill="var(--color-brand-secondary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
        </Card>
        <Card>
          <div className="space-y-4">
            <h3 className="font-semibold">Barang Paling Sering Keluar</h3>
            <SimpleList
              rows={summary.topItems}
              emptyMessage={loading ? 'Memuat data...' : 'Belum ada mutasi keluar.'}
              renderRow={(row) => (
                <>
                  <div>
                    <p className="font-medium">{row.itemName}</p>
                    <p className="text-xs text-ui-muted">{row.itemCode}</p>
                  </div>
                  <p className="font-semibold">{row.qty}</p>
                </>
              )}
            />
          </div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="space-y-4">
            <h3 className="font-semibold">Mutasi Terbaru</h3>
            <SimpleList
              rows={summary.recentLogs}
              emptyMessage={loading ? 'Memuat data...' : 'Belum ada mutasi.'}
              renderRow={(row) => (
                <>
                  <div>
                    <p className="font-medium">{row.item_name || row.item_code}</p>
                    <p className="text-xs text-ui-muted">{row.display_date || row.created_at?.slice(0, 10)} - {row.store_name || row.owner_name || row.mutation_type}</p>
                  </div>
                  <p className="text-sm font-semibold">{row.mutation_type} {row.qty}</p>
                </>
              )}
            />
          </div>
        </Card>
        <Card>
          <div className="space-y-4">
            <h3 className="font-semibold">Stok Rendah</h3>
            <SimpleList
              rows={items.filter((item) => item.current_stock <= 5).slice(0, 6)}
              emptyMessage={loading ? 'Memuat data...' : 'Tidak ada stok rendah.'}
              renderRow={(row) => (
                <>
                  <div>
                    <p className="font-medium">{row.item_name}</p>
                    <p className="text-xs text-ui-muted">{row.item_code}</p>
                  </div>
                  <p className="font-semibold">{row.current_stock}</p>
                </>
              )}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

function StoresPage({ onNotify }) {
  const [stores, setStores] = useState([])
  const [form, setForm] = useState({ ownerName: '', storeName: '', phoneNumber: '' })
  const [selectedStore, setSelectedStore] = useState(null)
  const [storeDetail, setStoreDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadStores() {
    setLoading(true)
    try {
      setStores(await window.api.stores.list())
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStores()
  }, [])

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    try {
      await window.api.stores.create(form)
      setForm({ ownerName: '', storeName: '', phoneNumber: '' })
      setMessage('Data toko berhasil ditambahkan.')
      onNotify('success', 'Data toko berhasil ditambahkan.')
      await loadStores()
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  async function openStoreDetail(store) {
    setSelectedStore(store)
    setStoreDetail(null)
    setDetailLoading(true)
    try {
      setStoreDetail(await loadStoreDetail(store))
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
      setSelectedStore(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadStoreDetail(store) {
    if (typeof window.api.stores.detail === 'function') {
      try {
        return await window.api.stores.detail({ storeId: store.id })
      } catch (err) {
        const message = String(err?.message || err)
        if (!message.includes('No handler registered')) throw err
      }
    }

    if (typeof window.api.logs.list !== 'function') {
      throw new Error('Aplikasi perlu direstart agar fitur detail toko aktif.')
    }

    const logs = await window.api.logs.list({ mutationType: 'OUT' })
    return {
      store,
      logs: logs.filter((log) => Number(log.store_id) === Number(store.id) && !log.canceled_at)
    }
  }

  const columns = [
    { key: 'owner_name', header: 'Owner' },
    { key: 'store_name', header: 'Nama Toko', render: (row) => row.store_name || '-' },
    { key: 'phone_number', header: 'No Handphone', render: (row) => row.phone_number || '-' },
    { key: 'total_qty_out', header: 'Total Qty Keluar' },
    { key: 'total_turnover', header: 'Omzet', render: (row) => formatRupiah(row.total_turnover) },
    { key: 'updated_at', header: 'Update Terakhir' },
    {
      key: 'actions',
      header: 'Action',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => openStoreDetail(row)}>
          <Eye size={16} />
          Detail
        </Button>
      )
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Toko" description="Kelola data owner, nama toko, dan nomor handphone." />
        <Button variant="ghost" onClick={loadStores} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>
      <Card>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end" onSubmit={submit}>
          <Field label="Owner Name">
            <Input required value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} />
          </Field>
          <Field label="Nama Toko">
            <Input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} />
          </Field>
          <Field label="No Handphone">
            <Input value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} />
          </Field>
          <div className="pt-6">
            <Button type="submit">Tambah Toko</Button>
          </div>
        </form>
      </Card>
      {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
      <Table columns={columns} rows={stores} getRowKey={(row) => row.id} loading={loading} emptyMessage="Belum ada data toko." />
      {selectedStore ? (
        <StoreDetailModal
          store={selectedStore}
          detail={storeDetail}
          loading={detailLoading}
          onClose={() => {
            setSelectedStore(null)
            setStoreDetail(null)
          }}
        />
      ) : null}
    </div>
  )
}

function StoreDetailModal({ store, detail, loading, onClose }) {
  const logs = detail?.logs || []
  const totalQty = logs.reduce((sum, log) => sum + log.qty, 0)
  const totalTurnover = logs.reduce((sum, log) => sum + log.qty * log.unit_price, 0)
  const columns = [
    { key: 'display_date', header: 'Tanggal' },
    { key: 'item_code', header: 'Kode' },
    { key: 'item_name', header: 'Nama Barang', render: (row) => row.item_name || '-' },
    { key: 'qty', header: 'Qty' },
    { key: 'unit_price', header: 'Harga Jual', render: (row) => formatRupiah(row.unit_price) },
    { key: 'total', header: 'Total', render: (row) => formatRupiah(row.qty * row.unit_price) },
    { key: 'operator_name', header: 'Operator', render: (row) => row.operator_name || '-' }
  ]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ui-text/40 p-4 sm:p-6">
      <Card className="max-h-[90vh] w-full max-w-5xl overflow-auto">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{store.store_name || store.owner_name}</h2>
              <p className="text-sm text-ui-muted">
                {store.owner_name}{store.phone_number ? ` - ${store.phone_number}` : ''}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup">
              <X size={18} />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactStat label="Total Item Keluar" value={totalQty} />
            <CompactStat label="Total Omzet" value={formatRupiah(totalTurnover)} />
            <CompactStat label="Jumlah Transaksi" value={logs.length} />
          </div>
          <Table
            columns={columns}
            rows={logs}
            getRowKey={(row) => row.id}
            loading={loading}
            emptyMessage="Belum ada barang yang pernah dikirim ke toko ini."
          />
        </div>
      </Card>
    </div>
  )
}

function EditItemModal({ item, onClose, onSaved, onNotify }) {
  const [form, setForm] = useState({
    itemCode: item.item_code,
    itemName: item.item_name,
    purchasePrice: item.purchase_price,
    defaultSellingPrice: item.default_selling_price,
    supplier: item.supplier || ''
  })
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    try {
      await window.api.inventory.updateItem(form)
      setMessage('Data barang berhasil diperbarui.')
      onNotify('success', 'Data barang berhasil diperbarui.')
      await onSaved()
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ui-text/40 p-4 sm:p-6">
      <Card className="w-full max-w-2xl">
        <form className="space-y-5" onSubmit={submit}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Edit Barang</h2>
              <p className="text-sm text-ui-muted">Ubah data barang tanpa mengubah jumlah stok.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup">
              <X size={18} />
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Kode Barang">
              <Input disabled value={form.itemCode} />
            </Field>
            <Field label="Nama Barang">
              <Input required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
            </Field>
            <Field label="Harga Beli">
              <Input required type="number" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
            </Field>
            <Field label="Harga Jual Default">
              <Input required type="number" min="0" value={form.defaultSellingPrice} onChange={(e) => setForm({ ...form, defaultSellingPrice: e.target.value })} />
            </Field>
            <Field label="Supplier">
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </Field>
          </div>
          {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={onClose}>Batal</Button>
            <Button type="submit">Simpan Perubahan</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function StockInModal({ onClose, onSaved, onNotify }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    itemCode: '',
    itemName: '',
    purchasePrice: '',
    qty: '',
    defaultSellingPrice: '',
    supplier: '',
    description: '',
    businessDate: today
  })
  const [items, setItems] = useState([])
  const [message, setMessage] = useState('')
  const [showItemSuggestions, setShowItemSuggestions] = useState(false)

  useEffect(() => {
    window.api.inventory.list().then(setItems)
  }, [])

  const matchedItems = showItemSuggestions && form.itemCode
    ? items
        .filter((item) => item.item_code.toLowerCase().includes(form.itemCode.toLowerCase()))
        .slice(0, 6)
    : []

  function selectExistingItem(item) {
    setForm({
      ...form,
      itemCode: item.item_code,
      itemName: item.item_name,
      purchasePrice: item.purchase_price,
      defaultSellingPrice: item.default_selling_price,
      supplier: item.supplier || ''
    })
    setShowItemSuggestions(false)
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    try {
      await window.api.inventory.stockIn(form)
      setForm({ itemCode: '', itemName: '', purchasePrice: '', qty: '', defaultSellingPrice: '', supplier: '', description: '', businessDate: today })
      setMessage('Stok masuk berhasil disimpan.')
      onNotify('success', 'Stok masuk berhasil disimpan.')
      await onSaved()
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ui-text/40 p-4 sm:p-6">
      <Card className="w-full max-w-3xl">
        <form className="space-y-5" onSubmit={submit}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Tambah Stok</h2>
              <p className="text-sm text-ui-muted">Jika kode sudah ada, stok akan ditambahkan otomatis.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup">
              <X size={18} />
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tanggal Transaksi"><Input required type="date" value={form.businessDate} onChange={(e) => setForm({ ...form, businessDate: e.target.value })} /></Field>
            <div className="relative space-y-1.5 text-sm font-medium">
              <span>Kode Barang</span>
              <Input
                required
                value={form.itemCode}
                onFocus={() => setShowItemSuggestions(true)}
                onChange={(e) => {
                  setForm({ ...form, itemCode: e.target.value })
                  setShowItemSuggestions(true)
                }}
              />
              {matchedItems.length ? (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-ui border border-ui-border bg-ui-surface shadow-ui">
                  {matchedItems.map((item) => (
                    <button
                      type="button"
                      key={item.item_code}
                      className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-ui-bg"
                      onClick={() => selectExistingItem(item)}
                    >
                      <span className="font-medium">{item.item_code}</span>
                      <span className="text-ui-muted">{item.item_name} - stok {item.current_stock}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Field label="Nama Barang"><Input required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} /></Field>
            <Field label="Harga Beli"><Input required type="number" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></Field>
            <Field label="Qty"><Input required type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>
            <Field label="Harga Jual Default"><Input required type="number" min="0" value={form.defaultSellingPrice} onChange={(e) => setForm({ ...form, defaultSellingPrice: e.target.value })} /></Field>
            <Field label="Supplier"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          </div>
          <Field label="Catatan"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={onClose}>Batal</Button>
            <Button type="submit">Simpan Stok Masuk</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function StockOutPage({ modal = false, onClose, onSaved, onNotify } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  const [items, setItems] = useState([])
  const [stores, setStores] = useState([])
  const [storeSearch, setStoreSearch] = useState('')
  const [showStoreOptions, setShowStoreOptions] = useState(false)
  const [form, setForm] = useState({
    items: [createStockOutRow()],
    storeId: '',
    ownerName: '',
    storeName: '',
    phoneNumber: '',
    description: '',
    businessDate: today
  })
  const [message, setMessage] = useState('')

  useEffect(() => {
    window.api.inventory.list().then(setItems)
    window.api.stores.list().then(setStores)
  }, [])

  const filteredStores = stores
    .filter((store) => {
      const keyword = storeSearch.toLowerCase()
      if (!keyword) return true
      return (
        store.owner_name.toLowerCase().includes(keyword) ||
        String(store.store_name || '').toLowerCase().includes(keyword) ||
        String(store.phone_number || '').toLowerCase().includes(keyword)
      )
    })
    .slice(0, 60)

  function updateStockOutRow(rowId, patch) {
    setForm((currentForm) => ({
      ...currentForm,
      items: currentForm.items.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    }))
  }

  function selectItem(rowId, itemCode) {
    const item = items.find((entry) => entry.item_code === itemCode)
    updateStockOutRow(rowId, {
      itemCode,
      itemSearch: item ? formatItemLabel(item) : '',
      unitPrice: item?.default_selling_price || '',
      showItemOptions: false
    })
  }

  function addStockOutRow() {
    setForm((currentForm) => ({
      ...currentForm,
      items: [...currentForm.items, createStockOutRow()]
    }))
  }

  function removeStockOutRow(rowId) {
    setForm((currentForm) => ({
      ...currentForm,
      items: currentForm.items.length > 1
        ? currentForm.items.filter((row) => row.id !== rowId)
        : currentForm.items
    }))
  }

  function selectStoreId(storeId) {
    const store = stores.find((entry) => String(entry.id) === String(storeId))
    setForm({
      ...form,
      storeId,
      ownerName: store?.owner_name || '',
      storeName: store?.store_name || '',
      phoneNumber: store?.phone_number || ''
    })
    setStoreSearch(store ? formatStoreLabel(store) : '')
    setShowStoreOptions(false)
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    try {
      if (!form.storeId) throw new Error('Toko wajib dipilih')
      const payload = {
        ...form,
        items: form.items.map(({ itemCode, unitPrice, qty }) => ({ itemCode, unitPrice, qty }))
      }
      await window.api.inventory.stockOut(payload)
      setForm({ items: [createStockOutRow()], storeId: '', ownerName: '', storeName: '', phoneNumber: '', description: '', businessDate: today })
      setStoreSearch('')
      setMessage(`Mutasi keluar ${payload.items.length} item berhasil disimpan.`)
      onNotify('success', `Mutasi keluar ${payload.items.length} item berhasil disimpan.`)
      setItems(await window.api.inventory.list())
      if (onSaved) await onSaved()
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  const formContent = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tanggal Transaksi"><Input required type="date" value={form.businessDate} onChange={(e) => setForm({ ...form, businessDate: e.target.value })} /></Field>
        <div className="relative space-y-1.5 text-sm font-medium">
          <span>Toko / Owner / No HP</span>
          <div className="relative">
            <Input
              required
              value={storeSearch}
              placeholder="Cari toko, owner, atau no HP"
              onFocus={() => setShowStoreOptions(true)}
              onBlur={() => window.setTimeout(() => setShowStoreOptions(false), 120)}
              onChange={(event) => {
                setStoreSearch(event.target.value)
                setShowStoreOptions(true)
                setForm({ ...form, storeId: '', ownerName: '', storeName: '', phoneNumber: '' })
              }}
            />
            <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ui-muted" />
          </div>
          {showStoreOptions ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-ui border border-ui-border bg-ui-surface py-1 shadow-ui">
              {filteredStores.length ? (
                filteredStores.map((store) => (
                  <button
                    type="button"
                    key={store.id}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-ui-bg focus:bg-ui-bg focus:outline-none"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectStoreId(String(store.id))}
                  >
                    <span className="font-medium text-ui-text">{store.store_name || store.owner_name}</span>
                    <span className="text-xs text-ui-muted">
                      {store.owner_name}{store.phone_number ? ` - ${store.phone_number}` : ''}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-ui-muted">Toko tidak ditemukan.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Item Mutasi</h3>
            <p className="text-sm text-ui-muted">Pilih beberapa barang untuk toko yang sama.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addStockOutRow}>
            <Plus size={16} />
            Tambah Item
          </Button>
        </div>
        <div className="space-y-2">
          {form.items.map((row, index) => {
            const selectedItem = items.find((item) => item.item_code === row.itemCode)
            const selectedItemCodes = new Set(form.items.map((item) => item.itemCode).filter(Boolean))
            const keyword = String(row.itemSearch || '').toLowerCase()
            const availableItems = items
              .filter((item) => item.item_code === row.itemCode || !selectedItemCodes.has(item.item_code))
              .filter((item) => {
                if (!keyword) return true
                return (
                  item.item_code.toLowerCase().includes(keyword) ||
                  item.item_name.toLowerCase().includes(keyword) ||
                  String(item.supplier || '').toLowerCase().includes(keyword)
                )
              })
              .slice(0, 80)
            return (
              <div key={row.id} className="grid gap-3 rounded-ui border border-ui-border bg-ui-bg p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_0.6fr_0.9fr_0.8fr_auto] xl:items-end">
                <div className="relative space-y-1.5 text-sm font-medium">
                  <span>Barang</span>
                  <div className="relative">
                    <Input
                      required
                      value={row.itemSearch || ''}
                      placeholder="Cari kode atau nama barang"
                      onFocus={() => updateStockOutRow(row.id, { showItemOptions: true })}
                      onBlur={() => window.setTimeout(() => updateStockOutRow(row.id, { showItemOptions: false }), 120)}
                      onChange={(event) => updateStockOutRow(row.id, {
                        itemSearch: event.target.value,
                        itemCode: '',
                        unitPrice: '',
                        showItemOptions: true
                      })}
                    />
                    <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ui-muted" />
                  </div>
                  {row.showItemOptions ? (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-ui border border-ui-border bg-ui-surface py-1 shadow-ui">
                      {availableItems.length ? (
                        availableItems.map((item) => (
                          <button
                            type="button"
                            key={item.item_code}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-ui-bg focus:bg-ui-bg focus:outline-none"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectItem(row.id, item.item_code)}
                          >
                            <span className="font-medium text-ui-text">{item.item_code} - {item.item_name}</span>
                            <span className="text-xs text-ui-muted">
                              Stok {item.current_stock}{item.supplier ? ` - ${item.supplier}` : ''}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-sm text-ui-muted">Barang tidak ditemukan.</div>
                      )}
                    </div>
                  ) : null}
                </div>
                <Field label="Stok">
                  <Input disabled value={selectedItem?.current_stock ?? ''} />
                </Field>
                <Field label="Qty">
                  <Input required type="number" min="1" value={row.qty} onChange={(e) => updateStockOutRow(row.id, { qty: e.target.value })} />
                </Field>
                <Field label="Harga Jual">
                  <Input required type="number" min="0" value={row.unitPrice} onChange={(e) => updateStockOutRow(row.id, { unitPrice: e.target.value })} />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-0.5 h-10 w-10 px-0 text-brand-danger hover:text-brand-danger"
                  disabled={form.items.length === 1}
                  title="Hapus item"
                  onClick={() => removeStockOutRow(row.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            )
          })}
        </div>
      </div>
      <Field label="Catatan"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="pt-2">
        <Button type="submit">Simpan Mutasi Keluar</Button>
      </div>
    </>
  )

  if (modal) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ui-text/40 p-4 sm:p-6">
        <Card className="max-h-[90vh] w-full max-w-5xl overflow-auto">
          <form className="space-y-5" onSubmit={submit}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Tambah Mutasi Multi Item</h2>
                <p className="text-sm text-ui-muted">Satu toko bisa menerima beberapa barang dalam satu transaksi.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup">
                <X size={18} />
              </Button>
            </div>
            {formContent}
            {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
          </form>
        </Card>
      </div>
    )
  }

  return (
    <FormPage title="Tambah Mutasi" description="Kurangi stok untuk pengiriman ke toko. Sistem menolak stok minus." onSubmit={submit} message={message}>
      {formContent}
    </FormPage>
  )
}

function LogsPage({ onNotify, onConfirm }) {
  const [filters, setFilters] = useState(initialFilters)
  const [logs, setLogs] = useState([])
  const [stores, setStores] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showMutationForm, setShowMutationForm] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadLogs(nextFilters = filters) {
    setLoading(true)
    try {
      setLogs(await window.api.logs.list(nextFilters))
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    loadLogs(filters)
  }, [filters.mutationType, filters.fromDate, filters.toDate, filters.search, filters.storeId])

  useEffect(() => {
    window.api.stores.list().then(setStores).catch(() => setStores([]))
  }, [])

  const activeLogs = logs.filter((log) => !log.canceled_at)
  const paginatedLogs = paginateRows(activeLogs, page, pageSize)

  async function exportExcel() {
    setMessage('')
    try {
      const result = await window.api.reports.exportSalesExcel(filters)
      if (result.ok) {
        setMessage(`Export Excel berhasil: ${result.rowCount} baris.`)
        onNotify('success', `Export Excel berhasil: ${result.rowCount} baris.`)
      }
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  const columns = [
    { key: 'display_date', header: 'Tanggal' },
    { key: 'mutation_type', header: 'Jenis' },
    { key: 'item_code', header: 'Kode' },
    { key: 'item_name', header: 'Nama Barang' },
    { key: 'qty', header: 'Qty' },
    { key: 'cost_price', header: 'Harga Beli', render: (row) => formatRupiah(row.cost_price) },
    { key: 'unit_price', header: 'Harga Jual', render: (row) => formatRupiah(row.unit_price) },
    { key: 'owner_name', header: 'Owner', render: (row) => row.owner_name || '-' },
    { key: 'store_name', header: 'Toko', render: (row) => row.store_name || row.owner_name || '-' },
    { key: 'operator_name', header: 'Operator' },
    {
      key: 'actions',
      header: 'Action',
      render: (row) => {
        const canCancel = row.mutation_type === 'OUT' && !row.canceled_at
        return (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={!canCancel}
            title={canCancel ? 'Batalkan mutasi keluar' : 'Tidak bisa dibatalkan'}
            onClick={async () => {
              if (!canCancel) return
              const result = await onConfirm({
                title: 'Batalkan Mutasi?',
                description: 'Qty barang akan dikembalikan ke stok gudang dan mutasi ini tidak dihitung lagi di laporan.',
                confirmLabel: 'Batalkan Mutasi',
                cancelLabel: 'Kembali',
                tone: 'danger',
                inputLabel: 'Alasan pembatalan',
                inputPlaceholder: 'Contoh: salah input toko atau qty',
                requireInput: false
              })
              if (!result.confirmed) return
              try {
                if (typeof window.api.inventory.cancelStockOut !== 'function') {
                  throw new Error('Aplikasi perlu direstart agar fitur batal mutasi aktif.')
                }
                await window.api.inventory.cancelStockOut({ logId: row.id, reason: result.value })
                setLogs((currentLogs) => currentLogs.filter((log) => log.id !== row.id))
                onNotify('success', 'Mutasi berhasil dibatalkan dan stok dikembalikan.')
                await loadLogs()
              } catch (err) {
                onNotify('error', getUserErrorMessage(err))
              }
            }}
          >
            Batal
          </Button>
        )
      }
    }
  ]

  return (
    <div className="space-y-6">
      <PageTitle title="Mutasi Stok" description="Tambah mutasi dan lihat laporan stok masuk/keluar dalam satu halaman." />
      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Laporan Mutasi</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => loadLogs()} disabled={loading}>
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                Refresh
              </Button>
              <Button onClick={() => setShowMutationForm((value) => !value)}>
                <Upload size={18} />
                {showMutationForm ? 'Tutup Mutasi' : 'Tambah Mutasi'}
              </Button>
              <Button variant="secondary" onClick={exportExcel}>
                <FileSpreadsheet size={18} />
                Export Excel
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_1fr]">
            <Field label="Search">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-muted" />
                <Input
                  className="pl-9"
                  placeholder="Cari kode, barang, toko"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </Field>
            <Field label="Jenis Mutasi">
              <Select
                value={filters.mutationType}
                onChange={(e) => setFilters({ ...filters, mutationType: e.target.value })}
              >
                <option value="ALL">Semua</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
              </Select>
            </Field>
            <Field label="Dari Tanggal">
              <Input type="date" value={filters.fromDate} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} />
            </Field>
            <Field label="Sampai Tanggal">
              <Input type="date" value={filters.toDate} onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} />
            </Field>
            <Field label="Filter Toko">
              <Select value={filters.storeId} onChange={(e) => setFilters({ ...filters, storeId: e.target.value })}>
                <option value="ALL">Semua toko</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.store_name || store.owner_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Card>
      {showMutationForm ? (
        <StockOutPage
          modal
          onNotify={onNotify}
          onClose={() => setShowMutationForm(false)}
          onSaved={async () => {
            setShowMutationForm(false)
            await loadLogs()
          }}
        />
      ) : null}
      {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
      <Table columns={columns} rows={paginatedLogs} getRowKey={(row) => row.id} loading={loading} emptyMessage="Belum ada mutasi stok sesuai filter." />
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalRows={activeLogs.length}
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize)
          setPage(1)
        }}
      />
    </div>
  )
}

function SettingsPage({ onNotify, onConfirm }) {
  const [settings, setSettings] = useState(null)
  const [credentials, setCredentials] = useState({ clientId: '', clientSecret: '' })
  const [activeSettingsTab, setActiveSettingsTab] = useState('backup')
  const [systemLogs, setSystemLogs] = useState([])
  const [systemFilters, setSystemFilters] = useState({ fromDate: '', toDate: '' })
  const [systemPage, setSystemPage] = useState(1)
  const [systemPageSize, setSystemPageSize] = useState(10)
  const [message, setMessage] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)

  useEffect(() => {
    window.api.settings.get().then((data) => {
      setSettings(data)
      setCredentials({ clientId: data.googleClientId || '', clientSecret: data.googleClientSecret || '' })
    })
  }, [])

  useEffect(() => {
    if (activeSettingsTab === 'system-log') {
      setSystemPage(1)
      window.api.logs.systemList(systemFilters).then(setSystemLogs)
    }
  }, [activeSettingsTab, systemFilters.fromDate, systemFilters.toDate])

  async function saveCredentials() {
    try {
      const next = await window.api.settings.saveGoogleCredentials(credentials)
      setSettings(next)
      setMessage('Credential Google tersimpan.')
      onNotify('success', 'Credential Google tersimpan.')
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  async function connectDrive() {
    try {
      setMessage('Browser Google akan dibuka. Selesaikan login untuk menghubungkan Drive.')
      onNotify('warning', 'Browser Google akan dibuka. Selesaikan login untuk menghubungkan Drive.')
      const next = await window.api.settings.connectGoogleDrive()
      setSettings(next)
      setMessage('Google Drive berhasil terhubung.')
      onNotify('success', 'Google Drive berhasil terhubung.')
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    }
  }

  async function backupNow() {
    setBackupLoading(true)
    try {
      const result = await window.api.settings.backupNow()
      const message = result.mode === 'updated' ? 'Backup berhasil meng-update file lama di Google Drive.' : 'Backup pertama berhasil dibuat di Google Drive.'
      setMessage(message)
      onNotify('success', message)
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
    } finally {
      setBackupLoading(false)
    }
  }

  async function restoreFromDrive() {
    const result = await onConfirm({
      title: 'Restore dari Google Drive?',
      description: 'Database lokal akan diganti dengan backup Google Drive. Aplikasi akan restart setelah restore selesai.',
      confirmLabel: 'Restore Sekarang',
      cancelLabel: 'Batal',
      tone: 'danger'
    })
    if (!result.confirmed) return
    setRestoreLoading(true)
    try {
      setMessage('Restore berjalan. Aplikasi akan restart setelah selesai.')
      onNotify('warning', 'Restore berjalan. Aplikasi akan restart setelah selesai.')
      await window.api.settings.restoreFromDrive()
    } catch (err) {
      onNotify('error', getUserErrorMessage(err))
      setRestoreLoading(false)
    }
  }

  if (!settings) return <ShellLoader />

  const systemColumns = [
    { key: 'created_at', header: 'Timestamp' },
    { key: 'action', header: 'Action' },
    { key: 'entity_type', header: 'Entity' },
    { key: 'entity_id', header: 'ID' },
    { key: 'description', header: 'Deskripsi' },
    { key: 'operator_name', header: 'Operator' }
  ]
  const paginatedSystemLogs = paginateRows(systemLogs, systemPage, systemPageSize)

  return (
    <div className="space-y-6">
      {backupLoading ? <ActionLoadingOverlay title="Backup ke Google Drive" description="Database sedang disiapkan dan diunggah. Jangan tutup aplikasi." /> : null}
      {restoreLoading ? <ActionLoadingOverlay title="Restore dari Google Drive" description="Backup sedang diunduh, divalidasi, lalu aplikasi akan restart." /> : null}
      <PageTitle title="Pengaturan" description="Kelola backup Google Drive dan audit log system." />
      <Card>
        <div className="space-y-5">
          <div className="flex gap-2">
            <Button variant={activeSettingsTab === 'backup' ? 'primary' : 'ghost'} onClick={() => setActiveSettingsTab('backup')}>
              GDrive Backup
            </Button>
            <Button variant={activeSettingsTab === 'system-log' ? 'primary' : 'ghost'} onClick={() => setActiveSettingsTab('system-log')}>
              Log System
            </Button>
          </div>

          {activeSettingsTab === 'backup' ? (
            <div className="space-y-5">
              <div className="rounded-ui border border-ui-border bg-ui-bg p-3 text-sm">
                <p className="font-medium">Lokasi Database Lokal</p>
                <p className="mt-1 break-all text-ui-muted">{settings.databasePath}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Google Client ID"><Input value={credentials.clientId} onChange={(e) => setCredentials({ ...credentials, clientId: e.target.value })} /></Field>
                <Field label="Google Client Secret"><Input type="password" value={credentials.clientSecret} onChange={(e) => setCredentials({ ...credentials, clientSecret: e.target.value })} /></Field>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={saveCredentials}>Simpan Credential</Button>
                <Button variant="secondary" onClick={connectDrive}>Hubungkan Google Drive</Button>
                <Button variant="secondary" onClick={backupNow} disabled={!settings.hasGoogleRefreshToken || backupLoading || restoreLoading}>
                  {backupLoading ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
                  Backup Sekarang
                </Button>
                <Button variant="danger" onClick={restoreFromDrive} disabled={!settings.hasGoogleRefreshToken || backupLoading || restoreLoading}>
                  {restoreLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                  Restore dari GDrive
                </Button>
              </div>
              <label className="flex items-center gap-3 pt-1 text-sm">
                <input
                  type="checkbox"
                  checked={settings.googleDriveBackupEnabled}
                  onChange={async (e) => {
                    const checked = e.target.checked
                    const previousSettings = settings
                    setSettings({ ...settings, googleDriveBackupEnabled: checked })
                    try {
                      await window.api.settings.setAutoBackup(checked)
                      onNotify('success', checked ? 'Auto-backup diaktifkan.' : 'Auto-backup dinonaktifkan.')
                    } catch (err) {
                      setSettings(previousSettings)
                      onNotify('error', getUserErrorMessage(err))
                    }
                  }}
                />
                Aktifkan auto-backup saat aplikasi ditutup
              </label>
              {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <Field label="Dari Tanggal">
                    <Input type="date" value={systemFilters.fromDate} onChange={(e) => setSystemFilters({ ...systemFilters, fromDate: e.target.value })} />
                  </Field>
                  <Field label="Sampai Tanggal">
                    <Input type="date" value={systemFilters.toDate} onChange={(e) => setSystemFilters({ ...systemFilters, toDate: e.target.value })} />
                  </Field>
                </div>
                <Button variant="secondary" onClick={() => window.api.logs.systemList(systemFilters).then(setSystemLogs)}>
                  Refresh
                </Button>
              </div>
              <Table columns={systemColumns} rows={paginatedSystemLogs} getRowKey={(row) => row.id} emptyMessage="Belum ada log system sesuai filter." />
              <PaginationControls
                page={systemPage}
                pageSize={systemPageSize}
                totalRows={systemLogs.length}
                onPageChange={setSystemPage}
                onPageSizeChange={(nextSize) => {
                  setSystemPageSize(nextSize)
                  setSystemPage(1)
                }}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function FormPage({ title, description, onSubmit, message, children }) {
  return (
    <div className="space-y-6">
      <PageTitle title={title} description={description} />
      <Card>
        <form className="space-y-5" onSubmit={onSubmit}>
          {children}
          {message ? <p className="text-sm text-brand-secondary">{message}</p> : null}
        </form>
      </Card>
    </div>
  )
}

function PageTitle({ title, description }) {
  return (
    <div className="space-y-1">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-ui-muted">{description}</p>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  )
}

function MetricCard({ label, value, compact = false }) {
  return (
    <Card>
      <p className="text-sm text-ui-muted">{label}</p>
      <p className={compact ? 'mt-2 text-2xl font-semibold' : 'mt-2 text-3xl font-semibold'}>{value}</p>
    </Card>
  )
}

function SimpleList({ rows, emptyMessage, renderRow }) {
  if (!rows.length) {
    return (
      <div className="grid min-h-40 place-items-center rounded-ui border border-ui-border bg-ui-bg px-4 text-center text-sm text-ui-muted">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="divide-y divide-ui-border rounded-ui border border-ui-border">
      {rows.map((row, index) => (
        <div key={row.id || row.itemCode || index} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 text-sm">
          {renderRow(row)}
        </div>
      ))}
    </div>
  )
}

function CompactStat({ label, value }) {
  return (
    <div className="rounded-ui border border-ui-border bg-ui-bg p-3">
      <p className="text-sm text-ui-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

function ChartFrame({ loading, empty, emptyMessage, children }) {
  return (
    <div className="relative h-72 overflow-hidden rounded-ui border border-ui-border bg-ui-surface">
      {loading ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-ui border border-ui-border bg-ui-surface px-4 py-3 text-sm text-ui-muted shadow-ui">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-primary/25 border-t-brand-primary" />
            Memuat data...
          </div>
        </div>
      ) : null}
      {!loading && empty ? (
        <div className="grid h-full place-items-center px-4 text-center text-sm text-ui-muted">
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function ActionLoadingOverlay({ title, description }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ui-text/45 p-4 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-sm rounded-ui border border-ui-border bg-ui-surface p-6 text-center shadow-ui">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-primary/10 text-brand-primary">
          <Loader2 size={30} className="animate-spin" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-ui-muted">{description}</p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ui-bg">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-primary" />
        </div>
      </div>
    </div>
  )
}

function PaginationControls({ page, pageSize, totalRows, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const startRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, totalRows)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-ui border border-ui-border bg-ui-surface px-4 py-3 text-sm">
      <p className="text-ui-muted">
        Menampilkan {startRow}-{endRow} dari {totalRows} data
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-ui-muted">
          Size
          <Select
            className="h-9 w-24"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </Select>
        </label>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Prev
          </Button>
          <span className="min-w-24 text-center text-ui-muted">
            {page} / {totalPages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

function paginateRows(rows, page, pageSize) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

function createStockOutRow() {
  return {
    id: `${Date.now()}-${Math.random()}`,
    itemCode: '',
    itemSearch: '',
    showItemOptions: false,
    unitPrice: '',
    qty: ''
  }
}

function ToastViewport({ toasts, onClose }) {
  return (
    <div className="fixed left-4 right-4 top-4 z-80 space-y-3 sm:left-auto sm:right-5 sm:top-5 sm:w-full sm:max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[
            'rounded-ui border bg-ui-surface p-4 text-sm shadow-ui',
            toast.type === 'success' ? 'border-brand-secondary' : '',
            toast.type === 'error' ? 'border-brand-danger' : '',
            toast.type === 'warning' ? 'border-amber-400' : '',
            toast.type === 'info' ? 'border-brand-primary' : ''
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold">{toastTitle(toast.type)}</p>
              <p className="text-ui-muted">{toast.message}</p>
            </div>
            <button
              type="button"
              className="rounded-ui px-2 text-ui-muted hover:bg-ui-bg hover:text-ui-text"
              onClick={() => onClose(toast.id)}
              aria-label="Tutup alert"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ dialog, onClose }) {
  const [value, setValue] = useState('')
  const isDanger = dialog.tone === 'danger'
  const canSubmit = !dialog.requireInput || value.trim().length > 0

  return (
    <div className="fixed inset-0 z-90 grid place-items-center bg-ui-text/45 p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <div className="space-y-5">
          <div className="space-y-2">
            <div
              className={[
                'flex h-11 w-11 items-center justify-center rounded-ui text-lg font-semibold',
                isDanger ? 'bg-brand-danger/10 text-brand-danger' : 'bg-brand-primary/10 text-brand-primary'
              ].join(' ')}
            >
              !
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{dialog.title}</h2>
              <p className="text-sm leading-6 text-ui-muted">{dialog.description}</p>
            </div>
          </div>

          {dialog.inputLabel ? (
            <Field label={dialog.inputLabel}>
              <Textarea
                value={value}
                placeholder={dialog.inputPlaceholder}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
              />
            </Field>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => onClose({ confirmed: false, value: '' })}>
              {dialog.cancelLabel || 'Batal'}
            </Button>
            <Button
              variant={isDanger ? 'danger' : 'primary'}
              disabled={!canSubmit}
              onClick={() => onClose({ confirmed: true, value: value.trim() })}
            >
              {dialog.confirmLabel || 'Konfirmasi'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function toastTitle(type) {
  if (type === 'success') return 'Berhasil'
  if (type === 'error') return 'Gagal'
  if (type === 'warning') return 'Perhatian'
  return 'Informasi'
}

function getUserErrorMessage(error) {
  const rawMessage = String(error?.message || error || 'Terjadi kesalahan')
  const handlerMatch = rawMessage.match(/Error occurred in handler for '[^']+': Error: (.+)$/)
  if (handlerMatch?.[1]) return handlerMatch[1]

  const errorMatch = rawMessage.match(/Error: (.+)$/)
  if (errorMatch?.[1]) return errorMatch[1]

  return rawMessage
}

function formatStoreLabel(store) {
  const storeName = store.store_name || store.owner_name
  const phone = store.phone_number ? ` - ${store.phone_number}` : ''
  return `${storeName} (${store.owner_name})${phone}`
}

function formatItemLabel(item) {
  return `${item.item_code} - ${item.item_name}`
}

function getDashboardPeriodRange(mode) {
  const today = new Date()

  if (mode === 'weekly') {
    const day = today.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const monday = addDays(today, mondayOffset)
    return {
      fromDate: formatDateInput(monday),
      toDate: formatDateInput(addDays(monday, 6))
    }
  }

  if (mode === 'monthly') {
    return {
      fromDate: formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
      toDate: formatDateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    }
  }

  const date = formatDateInput(today)
  return { fromDate: date, toDate: date }
}

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatPeriodLabel(range) {
  if (!range.fromDate && !range.toDate) return ''
  if (range.fromDate === range.toDate) return `Periode ${range.fromDate}.`
  return `Periode ${range.fromDate} sampai ${range.toDate}.`
}

function buildSummary(logs, items = []) {
  const activeLogs = logs.filter((log) => !log.canceled_at)
  const totalIn = activeLogs.filter((log) => log.mutation_type === 'IN').reduce((sum, log) => sum + log.qty, 0)
  const outLogs = activeLogs.filter((log) => log.mutation_type === 'OUT')
  const totalOut = outLogs.reduce((sum, log) => sum + log.qty, 0)
  const turnover = outLogs.reduce((sum, log) => sum + log.qty * log.unit_price, 0)
  const profit = outLogs.reduce((sum, log) => sum + (log.unit_price - log.cost_price) * log.qty, 0)
  const stockOnHand = items.reduce((sum, item) => sum + item.current_stock, 0)
  const dailyMap = new Map()
  const itemMap = new Map()

  outLogs.forEach((log) => {
    const date = log.display_date || log.created_at.slice(0, 10)
    dailyMap.set(date, (dailyMap.get(date) || 0) + log.qty)

    const itemCode = log.item_code
    const current = itemMap.get(itemCode) || {
      itemCode,
      itemName: log.item_name || itemCode,
      qty: 0
    }
    current.qty += log.qty
    itemMap.set(itemCode, current)
  })

  return {
    totalIn,
    totalOut,
    turnover,
    profit,
    stockOnHand,
    activeSku: itemMap.size,
    topItems: Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 6),
    recentLogs: activeLogs.slice(0, 6),
    chartRows: Array.from(dailyMap.entries())
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, qty]) => ({ date, qty }))
  }
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0))
}
