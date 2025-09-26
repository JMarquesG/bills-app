import { app, shell, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { is } from '@electron-toolkit/utils'
import { initDb } from '@bills/db'
import './ipc'
import { startAutomationScheduler, stopAutomationScheduler } from './automation-scheduler'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // Custom title bar configuration
    titleBarStyle: 'hidden',
    // Expose window controls on Windows/Linux
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
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

// Memory optimization for WASM modules
app.commandLine.appendSwitch('max-old-space-size', '4096'); // Increase heap size
app.commandLine.appendSwitch('max-semi-space-size', '128'); // Optimize garbage collection
app.commandLine.appendSwitch('js-flags', '--expose-gc'); // Enable manual GC


// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  try {
    console.log('🚀 Electron app ready, initializing database...')
    // Resolve DB directory for prod vs dev
    const dbDir = is.dev
      ? (process.env.DB_DIR || join(__dirname, '../pgdata'))  // Use __dirname for better path resolution
      : join(app.getPath('userData'), 'pgdata')
    await fs.mkdir(dbDir, { recursive: true })
    process.env.DB_DIR = dbDir
    console.log('📦 Using DB dir:', dbDir)
    
    // Initialize database with better error handling
    await initDb()
    console.log('✅ Database initialized successfully')
    
    // Start automation scheduler
    startAutomationScheduler()
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    // Don't prevent app from starting - user can reconfigure if needed
    console.log('⚠️ App will continue without fully initialized database')
  }
  
  console.log('📱 Creating window...')
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Disable refresh shortcuts while a window is focused
app.on('browser-window-focus', () => {
  globalShortcut.register('CommandOrControl+R', () => {
    console.log('CommandOrControl+R is pressed: Shortcut Disabled')
  })
  globalShortcut.register('F5', () => {
    console.log('F5 is pressed: Shortcut Disabled')
  })
})

// Re-enable shortcuts when focus is lost
app.on('browser-window-blur', () => {
  globalShortcut.unregister('CommandOrControl+R')
  globalShortcut.unregister('F5')
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopAutomationScheduler()
})
