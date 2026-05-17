# Alur Aplikasi Selling Apps

Dokumen ini menjelaskan alur aplikasi dari sisi user, data, dan proses internal.

## 1. Start Aplikasi

Saat aplikasi dibuka:

1. Electron main process berjalan.
2. SQLite database dibuka dari folder app data user.
3. Aplikasi membuat tabel yang belum ada.
4. Aplikasi menjalankan migrasi database ringan.
5. IPC handler didaftarkan.
6. Window React renderer dibuka.

Database tidak disimpan di folder project, tapi di app data Electron agar cocok untuk aplikasi desktop end-user.

## 2. Login dan Session

Saat database pertama kali dibuat, aplikasi otomatis membuat user admin default:

```text
Username: admin
Password: admin123
Role: administrator
```

Alur login:

1. User membuka aplikasi.
2. Renderer memanggil `window.api.auth.session()`.
3. Jika belum ada session, halaman login tampil.
4. User login dengan username/password.
5. Main process memvalidasi password dari tabel `users`.
6. Jika valid, user disimpan sebagai active session di memory main process.
7. Aksi login dicatat ke `system_logs`.

Session saat ini bersifat lokal memory. Jika aplikasi ditutup, user perlu login ulang.

## 3. RBAC / Hak Akses

Permission disiapkan untuk multi-user di masa depan.

Permission utama:

- `view_dashboard`
- `manage_stock_in`
- `manage_stock_out`
- `view_logs`
- `export_import`
- `manage_settings`

Frontend memakai `PermissionGate` untuk UI. Main process tetap melakukan pengecekan ulang melalui IPC handler, sehingga renderer tidak dipercaya sepenuhnya.

## 4. Stok Gudang

Halaman **Stok Gudang** menampilkan data dari tabel `inventory`.

Kolom utama:

- Kode barang
- Nama barang
- Stok saat ini
- Harga beli
- Harga jual default
- Supplier
- Update terakhir

Fitur:

- Search berdasarkan kode, nama barang, atau supplier.
- Refresh data.
- Tambah stok via modal.

## 5. Tambah Stok

Tambah stok dilakukan dari tombol **Tambah Stok** di halaman **Stok Gudang**.

Alur:

1. User klik **Tambah Stok**.
2. Modal form terbuka.
3. User mengisi tanggal transaksi.
4. Saat user mengetik kode barang, aplikasi menampilkan dropdown kode yang sudah ada.
5. Jika user memilih item dari dropdown:
   - Kode barang terisi.
   - Nama barang otomatis terisi.
   - Harga beli, harga jual default, dan supplier ikut terisi untuk mempercepat input.
6. Jika user tidak memilih dropdown, nama barang tetap diisi manual.
7. User isi qty dan harga.
8. Main process menjalankan UPSERT:
   - Jika barang belum ada, buat row baru di `inventory`.
   - Jika barang sudah ada, update data barang dan tambahkan qty ke stok saat ini.
9. Main process menulis laporan ke `stock_logs` dengan `mutation_type = 'IN'`.
10. Main process menulis audit ke `system_logs`.

Tanggal yang dipakai untuk laporan adalah `business_date`. Timestamp real saat input tetap disimpan di `created_at`.

## 6. Tambah Mutasi / Stock OUT

Halaman **Tambah Mutasi** dipakai untuk mengeluarkan stok ke toko.

Field utama:

- Tanggal transaksi
- Barang
- Stok saat ini
- Harga jual
- Qty keluar
- Nama pemilik toko
- Nama toko
- No handphone
- Catatan

Alur:

1. User pilih tanggal transaksi.
2. User pilih barang dari dropdown.
3. Harga jual otomatis diisi dari harga jual default, tapi tetap bisa diedit.
4. User isi qty dan data toko.
5. Main process memvalidasi stok.
6. Jika stok tidak cukup, transaksi ditolak.
7. Jika valid:
   - Toko dicatat ke `stores`.
   - Stok `inventory.current_stock` dikurangi.
   - Laporan OUT ditulis ke `stock_logs`.
   - Audit aksi ditulis ke `system_logs`.

## 7. Log Admin

Halaman **Log Admin** punya dua mode:

### Laporan Mutasi

Ini log operasional untuk barang masuk dan keluar. Sumber data: `stock_logs`.

Dipakai untuk:

- Laporan stok masuk.
- Laporan stok keluar.
- Export Excel.
- Rekap berdasarkan tanggal transaksi.

Kolom tanggal menampilkan `business_date`, bukan timestamp.

### Log System

Ini audit semua aksi sistem. Sumber data: `system_logs`.

Contoh aksi:

- Login
- Logout
- Tambah stok baru
- Tambah stok existing
- Mutasi keluar
- Export Excel
- Simpan credential Google Drive
- Hubungkan Google Drive
- Backup sekarang
- Ubah setting auto-backup

Log system tetap menampilkan timestamp penuh karena dipakai untuk audit teknis.

## 8. Export Excel

Export Excel dilakukan dari tab **Laporan Mutasi**.

Alur:

1. User pilih rentang tanggal.
2. User klik **Export Excel**.
3. Main process mengambil data OUT dari `stock_logs`.
4. Data difilter berdasarkan `business_date`.
5. Excel dibuat dengan format berwarna seperti contoh laporan.
6. User memilih lokasi simpan file.
7. Aksi export dicatat ke `system_logs`.

Kolom Excel:

- TANGGAL
- KODE
- NAMA BARANG
- H. BELI
- H. JUAL
- QTY
- T.H. BELI
- T.H. JUAL
- LABA

## 9. Backup Google Drive

Backup dilakukan dari halaman **Backup GDrive**.

Alur setup:

1. User membuat OAuth Desktop Client di Google Cloud Console.
2. User mengisi Client ID dan Client Secret di aplikasi.
3. User klik **Hubungkan Google Drive**.
4. Browser terbuka untuk login Google.
5. Refresh token disimpan lokal via `electron-store`.

Scope yang digunakan:

```text
https://www.googleapis.com/auth/drive.appdata
```

Backup disimpan di folder app data Google Drive.

Saat backup:

1. Aplikasi mencari file `selling-apps-data.sqlite` di `appDataFolder`.
2. Jika file sudah ada, aplikasi menjalankan `drive.files.update`.
3. Jika file belum ada, aplikasi menjalankan `drive.files.create`.

Jadi Google Drive tidak menumpuk banyak file backup.

## 10. Auto Backup Saat Aplikasi Ditutup

Jika toggle auto-backup aktif:

1. User menutup aplikasi.
2. Event `before-quit` berjalan.
3. Aplikasi menjalankan backup ke Google Drive.
4. Jika selesai, aplikasi keluar.

Untuk saat ini, jika backup gagal saat quit, aplikasi tetap keluar setelah proses ditangani. Ke depan bisa ditambah UI notifikasi retry.

## 11. Alur Data Utama

```text
React Renderer
  -> preload contextBridge
  -> IPC Handler Main Process
  -> Service Layer
  -> SQLite
```

Renderer tidak pernah query SQLite langsung.

## 12. Prinsip Waktu

Ada dua konsep waktu:

- `business_date`: tanggal transaksi yang dipilih user untuk laporan.
- `created_at`: timestamp sistem saat data benar-benar dibuat.

Semua timestamp sistem dibuat dalam zona WIB (`Asia/Jakarta`, UTC+7).
