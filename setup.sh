#!/usr/bin/env bash
set -euo pipefail

# --- root config ---
cat > package.json <<'JSON'
{
  "name": "bills-app",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run -w apps/web dev & npm run -w apps/desktop dev",
    "build": "npm run -w apps/web build && npm run -w apps/desktop build",
    "start": "npm run -w apps/desktop start",
    "turbo": "turbo"
  },
  "devDependencies": {
    "turbo": "2.1.3"
  }
}
JSON

# .gitignore
cat > .gitignore <<'GIT'
node_modules
dist
out
.next
*.log
.DS_Store
/apps/desktop/release
/apps/desktop/.vite
/pgdata
GIT

# turbo.json
cat > turbo.json <<'JSON'
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", "out/**", ".next/**"] },
    "start": { "cache": false }
  }
}
JSON

# Cursor rules
cat > .cursorrules <<'RULES'
# Bills App – Cursor Rules

## Tech choices
- Monorepo: npm workspaces + Turborepo
- Desktop: Electron (electron-vite, electron-builder, electron-updater)
- Web (renderer/dev): Next.js App Router
- State: Zustand; Validation: Zod
- Local DB: PGlite (embedded Postgres) via Drizzle ORM
- Keep dependencies minimal; avoid extra lint/format/testing for now.

## Project map
- apps/desktop: Electron main+preload using electron-vite. Loads Next (apps/web) in dev, file URL in prod.
- apps/web: Next.js UI (dashboard, invoices, expenses).
- packages/db: Drizzle schema and connection on PGlite (persist under app userData/pgdata).
- Database files: persist under Electron userData path (prod) or ./pgdata (dev).

## Conventions
- Strict Electron security: contextIsolation true, no nodeIntegration, preload IPC only.
- All file operations happen in main via preload-safe APIs.
- Do not add linters/formatters/libs unless requested.

## Tasks for AI in this repo
- Respect the folder structure above.
- When generating code, import DB from packages/db.
- Don’t introduce Prisma/SQLite; DB is PGlite for Supabase-compatible SQL.
- Keep scripts npm-only (no pnpm/yarn).
RULES

# --- packages/db ---
mkdir -p packages/db/src

cat > packages/db/package.json <<'JSON'
{
  "name": "@bills/db",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -w -p tsconfig.json"
  },
  "dependencies": {
    "@electric-sql/pglite": "0.3.7",
    "drizzle-orm": "0.44.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
JSON

cat > packages/db/tsconfig.json <<'JSON'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "declaration": true
  },
  "include": ["src"]
}
JSON

cat > packages/db/src/schema.ts <<'TS'
import { sql } from 'drizzle-orm';
/** Minimal schema via raw SQL to keep deps small; you can add drizzle table builders later. */
export const bootstrapSQL = sql.raw(`
  create table if not exists client (
    id text primary key,
    name text not null,
    email text,
    tax_id text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists invoice (
    id text primary key,
    number text unique not null,
    client_id text not null references client(id),
    issue_date date not null,
    due_date date,
    amount numeric(12,2) not null,
    currency text default 'EUR',
    status text default 'DRAFT',
    file_path text,
    folder_path text,
    notes text,
    paid_at timestamp,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists expense (
    id text primary key,
    invoice_id text references invoice(id),
    vendor text,
    category text,
    date date not null,
    amount numeric(12,2) not null,
    currency text default 'EUR',
    file_path text,
    notes text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists setting (
    id integer primary key,
    bills_root text,
    filename_tpl text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );
`);
TS

cat > packages/db/src/index.ts <<'TS'
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { bootstrapSQL } from './schema.js';

/** Resolve DB directory:
 * - DEV: ./pgdata (repo root)
 * - PROD: Electron main will pass absolute path via env DB_DIR
 */
const dbDir = process.env.DB_DIR || './pgdata';
export const client = new PGlite(dbDir);
export const db = drizzle({ client });

/** Initialize schema on first run */
export async function initDb() {
  await client.exec(bootstrapSQL.sql);
}

export async function healthcheck(): Promise<boolean> {
  const r = await client.query("select 1 as ok;");
  return r.rows?.[0]?.ok === 1;
}
TS

# --- shared TS base ---
cat > tsconfig.base.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "strict": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "types": []
  }
}
JSON

# --- apps/web (Next.js) ---
mkdir -p apps
npx --yes create-next-app@latest apps/web --ts --app --eslint=false --tailwind=false --src-dir=false --import-alias "@/*"

# Pin Next to latest minor implicitly installed by create-next-app; we keep defaults minimal.

# Add Zustand and Zod to web app (minimal)
npm i -w apps/web zustand@5.0.8 zod

# Simple homepage showing it's wired
cat > apps/web/app/page.tsx <<'TSX'
export default function Home() {
  return (
    <main style={{padding: 24}}>
      <h1>Bills App (Next.js renderer)</h1>
      <p>If you see this inside the Electron window, dev wiring works.</p>
    </main>
  );
}
TSX

# --- apps/desktop (Electron with electron-vite) ---
mkdir -p apps/desktop

cat > apps/desktop/package.json <<'JSON'
{
  "name": "@bills/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "cross-env RENDERER_URL=http://localhost:3000 electron-vite dev",
    "build": "electron-vite build && electron-builder --dir",
    "start": "electron-vite preview",
    "dist": "electron-builder"
  },
  "dependencies": {
    "electron-updater": "6.6.2",
    "@bills/db": "0.1.0"
  },
  "devDependencies": {
    "electron": "37.3.1",
    "electron-vite": "4.0.0",
    "electron-builder": "26.0.12",
    "typescript": "^5.5.4",
    "cross-env": "^7.0.3"
  }
}
JSON

cat > apps/desktop/tsconfig.json <<'JSON'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src"]
}
JSON

mkdir -p apps/desktop/src/main apps/desktop/src/preload

# electron-vite config (minimal)
cat > apps/desktop/electron.vite.config.ts <<'TS'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main'
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload'
    }
  },
  renderer: {
    // We don't use Vite renderer; Next.js serves the UI during dev.
  }
})
TS

# Electron main
cat > apps/desktop/src/main/index.ts <<'TS'
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb } from '@bills/db'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function getDbDir() {
  if (process.env.NODE_ENV === 'development') {
    // dev: repo-local folder (../.. from app/desktop)
    return join(__dirname, '../../../pgdata')
  }
  // prod: userData path
  return join(app.getPath('userData'), 'pgdata')
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const devUrl = process.env.RENDERER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Production: load statically exported Next if you choose to export later,
    // or point to a local file URL.
    await win.loadFile(join(__dirname, '../../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // expose DB path for the pglite process
  process.env.DB_DIR = getDbDir()
  await initDb()
  await createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// Example secure IPC placeholder
ipcMain.handle('ping', async () => 'pong')
TS

# Electron preload
cat > apps/desktop/src/preload/index.ts <<'TS'
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping')
})
declare global {
  interface Window { api: { ping(): Promise<string> } }
}
TS

# electron-builder config (simple)
cat > apps/desktop/electron-builder.yml <<'YML'
appId: com.example.billsapp
productName: BillsApp
files:
  - "dist/**"
extraResources:
  - from: ../../pgdata
    to: pgdata
    filter: "**/*"
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
publish: # wire later for auto-update
  - provider: generic
    url: https://your-update-host/ # replace when ready
YML

# Top-level install (monorepo)
npm i

# Link workspace deps
npm i -w packages/db
npm i -w apps/desktop
npm i -w apps/web

echo "✅ Setup complete.

Next:
1) npm run dev
   - Opens Electron pointing at Next dev server.
2) DB files: ./pgdata in dev; Electron userData/pgdata in prod.
"
