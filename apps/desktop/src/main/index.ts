import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { is } from '@electron-toolkit/utils'
import { initDb } from '@bills/db'
import './ipc'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  try {
    console.log('🚀 Electron app ready, initializing database...')
    // Resolve DB directory for prod vs dev
    const dbDir = is.dev
      ? (process.env.DB_DIR || join(process.cwd(), 'pgdata'))
      : join(app.getPath('userData'), 'pgdata')
    await fs.mkdir(dbDir, { recursive: true })
    process.env.DB_DIR = dbDir
    console.log('📦 Using DB dir:', dbDir)
    // Initialize database
    await initDb()
    console.log('✅ Database initialized successfully')
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
  }
  
  console.log('📱 Creating window...')
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
