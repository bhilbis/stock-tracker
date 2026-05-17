# Selling Apps

Aplikasi desktop manajemen stok lokal berbasis Electron, React, Tailwind CSS, dan SQLite. Aplikasi berjalan offline-first, menyimpan data di lokal user, dan disiapkan agar arsitekturnya mudah dikembangkan ke multi-user/cloud.

## Tech Stack

- Desktop: Electron + Electron-Vite
- Frontend: React + Tailwind CSS v4
- UI: Lucide React, Recharts
- Database lokal: SQLite via `better-sqlite3`
- Export laporan: ExcelJS
- Backup cloud: Google Drive API via `googleapis`
- Config/token lokal: `electron-store`

## Run Development

```bash
npm install
npm run rebuild:native
npm run dev
```

Default login:

```text
Username: admin
Password: admin123
```

## Build

```bash
npm run build
```

## Build Installer untuk Klien

```bash
npm run dist
```

Output installer ada di:

```text
release/Selling Apps Setup 0.1.0.exe
```

File tersebut yang diberikan ke klien. Setelah install, aplikasi bisa dibuka dari desktop shortcut atau Start Menu. Database SQLite tetap tersimpan lokal di komputer klien dan bisa dilihat dari menu **Settings > GDrive Backup** pada bagian lokasi database.

Untuk build folder tanpa installer:

```bash
npm run dist:dir
```

Output-nya ada di:

```text
release/win-unpacked/Selling Apps.exe
```

## Struktur Project

```text
src/
├── main/       Electron main process, IPC handler, service, database
├── preload/    Secure IPC bridge
└── renderer/   React UI
```

## Dokumentasi Detail

- Alur aplikasi lengkap: [docs/APP_FLOW.md](docs/APP_FLOW.md)
- Migrasi database: [docs/DATABASE_MIGRATION.md](docs/DATABASE_MIGRATION.md)

## Catatan Native Module

Project memakai `better-sqlite3`, jadi di Windows developer machine perlu Visual Studio Build Tools 2022 dengan workload **Desktop development with C++**.

Jika muncul masalah native module:

```bash
npm run rebuild:native
```

Project memakai `electron@37.x` agar kompatibilitas native module lebih stabil.

## Icon Aplikasi

Logo source ada di `src/renderer/src/assets/tracker.png`. Saat build produksi, script `npm run make:icon` otomatis membuat `build/icon.ico` untuk icon desktop dan installer.
