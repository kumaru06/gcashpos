# GCash POS (Electron)

Hybrid offline-first POS desktop app scaffold.

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
npm run dist
```

Notes
- Database is stored in the Electron `userData` directory (gcashpos.db).
- Replace `syncService` endpoint in `src/main/syncService.js` with real API.
- This scaffold enables `contextIsolation` and exposes a minimal API through `preload.js`.
