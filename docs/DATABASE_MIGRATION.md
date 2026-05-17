# Migrasi Database

Dokumen ini menjelaskan cara migrasi database SQLite di aplikasi Selling Apps.

## Lokasi Database

Database bernama:

```text
data.sqlite
```

File ini dibuat di folder app data Electron:

```js
app.getPath('userData')
```

Database tidak berada di root project.

## Kapan Migrasi Berjalan

Migrasi berjalan otomatis setiap aplikasi dibuka, di fungsi:

```text
src/main/storage/database.js
```

Entry point:

```js
initializeDatabase(userDataPath)
```

Urutan proses:

1. Buka koneksi SQLite.
2. Aktifkan WAL mode.
3. Aktifkan foreign key.
4. Jalankan `CREATE TABLE IF NOT EXISTS`.
5. Jalankan `runMigrations(db)`.
6. Return koneksi database dan path database.

## Kenapa Migrasi Diperlukan

Saat aplikasi sudah dipakai klien, database lama tidak boleh dihapus hanya karena ada perubahan schema.

Contoh:

- Versi awal `stock_logs` belum punya `business_date`.
- Versi baru butuh `business_date` untuk membedakan tanggal laporan dan timestamp input.
- Database lama perlu ditambahkan kolom tanpa kehilangan data.

## Migrasi Saat Ini

Migrasi saat ini menambahkan kolom:

```sql
business_date TEXT
```

ke tabel:

```sql
stock_logs
```

Jika kolom belum ada:

```sql
ALTER TABLE stock_logs ADD COLUMN business_date TEXT;
```

Lalu data lama diisi dari tanggal `created_at`:

```sql
UPDATE stock_logs
SET business_date = substr(created_at, 1, 10)
WHERE business_date IS NULL;
```

Setelah kolom tersedia, index dibuat:

```sql
CREATE INDEX IF NOT EXISTS idx_stock_logs_business_date
ON stock_logs(business_date);
```

Index dibuat setelah migrasi kolom agar tidak terjadi error:

```text
SqliteError: no such column: business_date
```

## Cara Menambah Migrasi Baru

Tambahkan migrasi di fungsi:

```js
function runMigrations(db) {
  // migration here
}
```

Pola aman:

1. Cek schema dulu dengan `PRAGMA table_info(table_name)`.
2. Jika kolom belum ada, jalankan `ALTER TABLE`.
3. Jika perlu backfill data lama, jalankan `UPDATE`.
4. Baru buat index yang bergantung pada kolom tersebut.

Contoh:

```js
const columns = db.prepare('PRAGMA table_info(stock_logs)').all()

if (!columns.some((column) => column.name === 'new_column')) {
  db.exec('ALTER TABLE stock_logs ADD COLUMN new_column TEXT')
  db.exec("UPDATE stock_logs SET new_column = 'default' WHERE new_column IS NULL")
}

db.exec('CREATE INDEX IF NOT EXISTS idx_stock_logs_new_column ON stock_logs(new_column)')
```

## Aturan Penting Migrasi

- Jangan drop tabel di database production.
- Jangan hapus kolom yang masih mungkin dipakai data lama.
- Jangan rename kolom langsung tanpa strategi copy/backfill.
- Jangan membuat index pada kolom baru sebelum kolom dipastikan ada.
- Jangan menghapus file `data.sqlite` milik klien.
- Selalu buat backup sebelum migrasi besar.

## Migrasi yang Tidak Bisa dengan ALTER Sederhana

SQLite punya keterbatasan untuk perubahan schema tertentu.

Jika perlu perubahan besar seperti:

- Rename banyak kolom
- Ubah tipe data penting
- Ubah constraint
- Pecah tabel

Gunakan pola rebuild table:

1. `CREATE TABLE new_table (...)`
2. Copy data dari tabel lama ke tabel baru.
3. Validasi jumlah data.
4. Rename tabel lama ke backup.
5. Rename tabel baru ke nama asli.
6. Setelah aman, baru hapus tabel backup di versi berikutnya.

## Backup Sebelum Migrasi Besar

Untuk migrasi kecil seperti tambah kolom, migrasi otomatis cukup aman.

Untuk migrasi besar, lakukan backup:

1. Tutup aplikasi.
2. Copy file `data.sqlite`, `data.sqlite-wal`, dan `data.sqlite-shm` jika ada.
3. Simpan ke folder backup lokal atau Google Drive.
4. Jalankan aplikasi versi baru.
5. Verifikasi data.

## Debug Migrasi

Jika aplikasi gagal start karena SQLite:

1. Lihat error terminal `npm run dev`.
2. Cari nama kolom/tabel yang error.
3. Cek urutan `CREATE TABLE`, migrasi, dan `CREATE INDEX`.
4. Pastikan index tidak dibuat sebelum kolom ada.

Untuk melihat kolom tabel:

```sql
PRAGMA table_info(stock_logs);
```

Untuk melihat index:

```sql
PRAGMA index_list(stock_logs);
```

## Rencana Improvement

Saat aplikasi makin besar, migrasi sebaiknya dibuat berbasis versi:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

Dengan begitu setiap migrasi hanya berjalan sekali dan riwayat schema lebih jelas.
