Role: Anda adalah seorang Expert Fullstack Developer yang spesialis dalam membangun aplikasi desktop menggunakan Electron.js, React (Vite), Tailwind CSS, dan SQLite.

Tugas: Bantu saya membangun aplikasi desktop manajemen stok lokal (saat ini single-user, namun arsitekturnya wajib siap untuk multi-user/cloud di masa depan). Aplikasi ini berjalan sepenuhnya secara lokal, offline-first, menggunakan SQLite sebagai database, memiliki fitur ekspor/impor CSV, manajemen hak akses (RBAC), dan auto-backup ke Google Drive. Semua pencatatan waktu WAJIB menggunakan zona waktu WIB (Asia/Jakarta / UTC+7).

Berikut adalah spesifikasi detail proyek yang harus kita buat:

### 1. TECH STACK LATEST VERSION & CONFIGURATION

- Framework Desktop: Electron.js (dengan Electron-Vite boilerplate)
- Frontend: React.js + Tailwind CSS + Lucide React (Icons) + Recharts (Dashboard)
- Database: SQLite (menggunakan library 'better-sqlite3' di Main Process)
- Data Utility: PapaParse (untuk Export/Import CSV)
- Cloud Utility: googleapis (Google Drive API untuk Desktop OAuth 2.0)
- State/Storage: electron-store (untuk menyimpan config & token lokal)

### 1.5. DESIGN SYSTEM & CSS ARCHITECTURE (TAILWIND v4 STANDARDS)

Untuk memastikan UI konsisten, modern, dan mudah di-maintain (cukup ubah style parent/komponen utama, maka seluruh aplikasi ikut berubah), wajib menerapkan aturan arsitektur CSS berikut:

A. Tailwind v4 Theme Tokens (`src/renderer/src/index.css`)

- Jangan menggunakan warna mentah bawaan Tailwind di halaman fitur (hindari `bg-blue-600` atau `text-zinc-800` langsung di halaman).
- Wajib definisikan design tokens menggunakan `@theme` directive di file CSS utama. Gunakan nama semantik seperti:
  - `--color-brand-primary`: Warna utama aplikasi (tombol utama, aksen).
  - `--color-brand-secondary`: Warna sekunder.
  - `--color-ui-bg`: Warna background utama halaman.
  - `--color-ui-surface`: Warna background untuk card, modal, atau table row.
  - `--color-ui-border`: Warna border standar untuk form dan devider.
  - `--radius-ui`: Standar kelengkungan border (border-radius).

B. Atomic UI Component Encapsulation

- Dilarang keras menulis utility class form element (seperti border, padding, ring, font-size) berulang-ulang di halaman fitur.
- Buat folder `src/renderer/src/components/ui/` yang berisi komponen atomik mandiri:
  - `Button.jsx`: Menerima prop `variant` ('primary', 'secondary', 'danger') dan `size`. Jika prop `disabled` aktif, berikan style visual yang konsisten.
  - `Input.jsx`: Komponen input teks/angka terstandar dengan state focus ring yang seragam.
  - `Card.jsx`: Pembungkus konten dengan padding, background surface, dan shadow yang konsisten.
  - `Table.jsx`: Struktur table (header, row, cell) yang sudah ter-styling rapi.

C. Parent-State & Utility Consistency

- Gunakan utility class kombinasi seperti `space-y-*` atau `gap-*` pada parent element untuk mengatur jarak antar komponen, sehingga child component tidak memiliki margin luar (outer margin) yang keras.
- Styling elemen yang terpengaruh oleh RBAC (Akses Ditolak) harus memanfaatkan class utility `disabled:opacity-50 disabled:cursor-not-allowed` yang terintegrasi di dalam komponen dasar `<Button>` atau `<Input>`.

### 2. SKEMA DATABASE (SQLite)

Buat file database bernama 'data.sqlite' di direktori lokal aman (app data). Buat 3 tabel utama dengan relasi terstruktur:

Tabel `inventory`:

- item_code (TEXT, Primary Key, Unique)
- item_name (TEXT)
- current_stock (INTEGER, Default 0)
- purchase_price (INTEGER, Default 0)
- default_selling_price (INTEGER, Default 0)
- supplier (TEXT, Nullable)
- created_at (TEXT/DATETIME)
- updated_at (TEXT/DATETIME)

Tabel `stores`:

- id (INTEGER, Primary Key, Autoincrement)
- owner_name (TEXT)
- store_name (TEXT, Nullable)
- phone_number (TEXT, Nullable)
- created_at (TEXT/DATETIME)
- updated_at (TEXT/DATETIME)

Tabel `stock_logs`:

- id (INTEGER, Primary Key, Autoincrement)
- item_code (TEXT, Foreign Key ke inventory.item_code)
- store_id (INTEGER, Foreign Key ke stores.id, Nullable)
- mutation_type (TEXT, Nilai: 'IN' atau 'OUT')
- qty (INTEGER)
- cost_price (INTEGER)
- unit_price (INTEGER)
- description (TEXT, Nullable)
- operator_name (TEXT) //ambil nama sesuai session yang aktif saat ini dibuat
- operator_role (TEXT) //ambil nama sesuai session yang aktif saat ini dibuat
- created_at (TEXT/DATETIME)

### 3. MANAGEMENT HAK AKSES (RBAC PREPARATION)

Meskipun saat ini aplikasi masih digunakan oleh 1 user (Admin), struktur frontend wajib dikunci menggunakan sistem Permission Gate agar kelak saat menambah user/sales tidak perlu merombak ulang UI.

- Buat sebuah global state atau mock object untuk data user yang sedang aktif, contoh:

  `const currentUser = { name: 'Admin', role: 'administrator', permissions: ['view_dashboard', 'manage_stock_in', 'manage_stock_out', 'view_logs', 'export_import', 'manage_settings'] }` //administrator have default to all access

- Buat sebuah komponen pembungkus di React bernama `<PermissionGate>` yang menerima prop `allowedPermissions` dan optional prop `renderProps` (boolean).
- Jika `currentUser` tidak memiliki izin:
  - Jika halaman/route: Tampilkan halaman kosong dengan pesan "Akses Ditolak" yang estetik.
  - Jika berupa tombol/aksi di dalam halaman: Jangan sembunyikan tombolnya (agar layout tidak melompat), melainkan berikan prop `disabled={true}` ke komponen UI child-nya dan berikan tooltip petunjuk.
- Terapkan pembungkus ini pada setiap tombol krusial (seperti hapus, edit, export/import) dan gerbang routing halaman.

### 4. FITUR UTAMA & HALAMAN (RENDERER PROCESS / REACT)

A. Dashboard Monitoring:

- Tampilkan statistik ringkasan Harian, Mingguan, dan Bulanan.
- Metrik: Total Barang Masuk (IN), Total Barang Keluar (OUT), Estimasi Perputaran Uang/Omzet.
- Hitung Berapa qty yang masuk di tiap-tiap toko dan toko mana yang produknya lebih cepat dan banyak habisnya dalah harian, mingguan, dan bulanan (jadi pada toko juga ada statistikanya)
- Tampilkan grafik batang sederhana (Recharts) untuk tren barang keluar harian/mingguan.
- Proteksi halaman dengan permission: `view_dashboard`.

B. Halaman Tambah Mutasi Stok Gudang (Stock IN):

- Form input: Kode Barang, Nama Barang, Harga Beli, Qty, Harga Jual Default.
- Logika Backend: Gunakan operasi UPSERT. Jika `kode_barang` belum ada, buat produk baru di tabel `products`. Jika sudah ada, update `nama_barang`, perbarui `harga_beli_terakhir`, timpa `harga_jual_default`, dan TAMBAHKAN `qty` ke `stok_saat_ini`.
- Setiap transaksi sukses wajib mencatat satu baris baru ke `stock_logs` dengan `jenis_mutasi = 'IN'`.
- Proteksi halaman dengan permission: `manage_stock_in`.

C. Halaman Keluar Stok (Stock OUT):

- Form input: Pilih Kode/Nama Barang (dropdown search/auto-complete), Harga Jual (otomatis terisi dari `harga_jual_default` produk, tetapi inputnya tetap bisa diedit manual oleh user), Qty yang dikeluarkan, Nama Pemilik Toko, Nama Toko (Opsional), No Handphone (Opsional).
- Logika Backend: Lakukan validasi sisa stok sebelum disubmit agar tidak terjadi stok minus. Jika valid, kurangi `stok_saat_ini` di tabel `products` dan catat ke `stock_logs` dengan `jenis_mutasi = 'OUT'`.
- Proteksi halaman dengan permission: `manage_stock_out`.

D. Halaman Log History Full:

- Tabel data yang menampilkan seluruh riwayat dari `stock_logs` secara lengkap.
- Sediakan filter berdasarkan jenis mutasi (Semua / IN / OUT) dan rentang tanggal (Date Picker).
- Sediakan Tombol "Export ke CSV" dan "Import dari CSV" (menggunakan PapaParse) untuk mempermudah backup manual atau pemindahan data via Excel.
- Proteksi halaman dengan permission: `view_logs` dan `export_import`.

E. Halaman Pengaturan & Auto-Backup Google Drive:

- Sediakan Toggle: "Aktifkan Auto-Backup ke Google Drive".
- Jika diaktifkan pertama kali, jalankan alur OAuth 2.0 Desktop Auth. Buka browser lokal untuk login dan persetujuan user. Ambil Access Token dan Refresh Token, lalu simpan Refresh Token secara aman di lokal melalui `electron-store`.
- Minta izin akses khusus dengan scope `https://www.googleapis.com/auth/drive.appdata` (Folder tersembunyi khusus aplikasi di Drive user agar aman dari penghapusan tidak sengaja).
- Logika Auto-Backup: Buat fungsi di Main Process di mana setiap kali aplikasi mendeteksi event akan ditutup (`window-all-closed` / sebelum `quit`) ATAU ketika tombol "Backup Sekarang" ditekan, aplikasi akan mengunggah/menimpa file `data.sqlite` ke folder appData Google Drive tersebut secara asinkron.
- Proteksi halaman dengan permission: `manage_settings`.

### 5. ATURAN ARSITEKTUR KODE (SCALABILITY RULES)

- SERVICE PATTERN: Pisahkan logika UI (React) dengan query database. Jangan menulis query SQLite langsung di dalam file IPC Handler. Buatlah file layer terpisah di Main Process (misal: `ProductService.js`, `LogService.js`). Langkah ini krusial agar di masa depan, jika aplikasi ini bermigrasi dari SQLite lokal ke Cloud API (Laravel/Next.js), saya hanya perlu mengganti isi file Service tersebut tanpa merusak atau mengubah komponen UI di sisi React.
- IPC SECURITY: Pastikan setiap fungsi IPC Handler di Main Process (Node.js) melakukan pengecekan ulang terhadap isi permission user sebelum mengeksekusi query ke SQLite. Jangan mempercayai input dari frontend secara mentah-mentah.
- ATOMICITY: Terapkan database transaction (`db.transaction()`) pada better-sqlite3 saat proses update stok produk sekaligus penulisan log mutasi berjalan, demi mencegah data korup atau tidak sinkron.
- TIMEZONE: Pastikan semua manipulasi tanggal (menggunakan native JavaScript Date atau library seperti `date-fns` / `moment-timezone`) menghasilkan string waktu format WIB (Asia/Jakarta) sebelum disimpan ke SQLite.

Mari kita mulai membuat aplikasinya langkah demi langkah. Pertama, buatkan saya struktur folder proyek yang sesuai dengan standard Electron-Vite, file `package.json` beserta dependencies yang dibutuhkan, dan setup file `preload.js` sebagai IPC Bridge aman antara Main Process dan Renderer Process.
