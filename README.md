# CashPOS (Electron)

Hybrid offline-first POS desktop app.

Quick start

1. Install dependencies:

```powershell
npm install
```

2. Run in dev:

```powershell
npm run dev
```

3. Build installer (Windows):

```powershell
npm run build
```

Notes
- Database is stored in the Electron `userData` directory.
- Default cloud API: `https://adminpos.online/api`
- Auto-update: GitHub Releases (see `.github/workflows/release-desktop.yml`).
