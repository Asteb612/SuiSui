import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { watch } from 'node:fs'
import { registerIpcHandlers } from './ipc/handlers'

const isDev = !app.isPackaged
const isTestMode = process.env.APP_TEST_MODE === '1'

let mainWindow: BrowserWindow | null = null
let reloadTimeout: NodeJS.Timeout | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'SuiSui - BDD Test Builder',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'public/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupAutoReload() {
  if (!isDev || isTestMode) return

  const distElectronPath = path.join(__dirname)
  
  try {
    watch(distElectronPath, { recursive: true }, (eventType, filename) => {
      // Ignore changes to preload.js to avoid reload loops
      if (filename && filename.includes('preload.js')) return
      
      // Debounce reload to avoid multiple rapid reloads
      if (reloadTimeout) {
        clearTimeout(reloadTimeout)
      }
      
      reloadTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log(`[Auto-reload] Reloading window after ${filename} changed`)
          mainWindow.reload()
        }
      }, 300)
    })
    console.log('[Auto-reload] Watching for file changes in', distElectronPath)
  } catch (error) {
    console.warn('[Auto-reload] Failed to setup file watcher:', error)
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(ipcMain, dialog, shell, { isTestMode })
  createWindow()
  setupAutoReload()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
