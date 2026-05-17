import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } from 'electron'
import path from 'node:path'
import { watch } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc/handlers'
import { runDepCheck, printDepCheckReport } from './utils/depChecker'

const isDev = !app.isPackaged
const isTestMode = process.env.APP_TEST_MODE === '1'
const isTestDepsMode = process.argv.includes('--test-deps')

// Register custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null
let reloadTimeout: NodeJS.Timeout | null = null

const ALLOWED_ORIGINS = ['app://.', 'http://localhost:3000']

function isAllowedAppUrl(url: string): boolean {
  return ALLOWED_ORIGINS.some((origin) => url.startsWith(origin))
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

/**
 * Lock the renderer down: deny in-app navigation to foreign origins and
 * route any window.open / target=_blank to the OS browser (only for
 * http/https/mailto), instead of opening an Electron window with Node access.
 */
function applyNavigationGuards(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppUrl(url)) {
      event.preventDefault()
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url)
      }
    }
  })
}

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
      sandbox: true,
      webSecurity: true,
    },
    title: 'SuiSui - BDD Test Builder',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  applyNavigationGuards(mainWindow)

  if (isDev && !isTestMode) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL('app://./index.html')
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

function registerAppProtocol() {
  const publicPath = path.join(__dirname, 'public')

  const CSP =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none'"

  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    let filePath = path.join(publicPath, url.pathname)

    // Default to index.html for root or paths without extensions
    if (url.pathname === '/' || !path.extname(filePath)) {
      filePath = path.join(publicPath, 'index.html')
    }

    const response = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  })
}

app.whenReady().then(() => {
  // Handle --test-deps mode: check dependencies and exit without UI
  if (isTestDepsMode) {
    console.log('Running in dependency test mode...')
    const report = runDepCheck()
    printDepCheckReport(report)

    // Exit with appropriate code
    const exitCode = report.summary.missing > 0 || report.summary.error > 0 ? 1 : 0
    app.exit(exitCode)
    return
  }

  // Hide the application menu
  Menu.setApplicationMenu(null)

  if (!isDev || isTestMode) {
    registerAppProtocol()
  }
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
