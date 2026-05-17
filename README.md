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
