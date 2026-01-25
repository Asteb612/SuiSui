"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mainWindow = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const handlers_1 = require("./ipc/handlers");
const isDev = process.env.NODE_ENV !== 'production';
const isTestMode = process.env.APP_TEST_MODE === '1';
let mainWindow = null;
exports.mainWindow = mainWindow;
let reloadTimeout = null;
function createWindow() {
    exports.mainWindow = mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        title: 'SuiSui - BDD Test Builder',
        show: false,
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(node_path_1.default.join(__dirname, '../.output/public/index.html'));
    }
    mainWindow.on('closed', () => {
        exports.mainWindow = mainWindow = null;
    });
}
function setupAutoReload() {
    if (!isDev || isTestMode)
        return;
    const distElectronPath = node_path_1.default.join(__dirname);
    try {
        (0, node_fs_1.watch)(distElectronPath, { recursive: true }, (eventType, filename) => {
            // Ignore changes to preload.js to avoid reload loops
            if (filename && filename.includes('preload.js'))
                return;
            // Debounce reload to avoid multiple rapid reloads
            if (reloadTimeout) {
                clearTimeout(reloadTimeout);
            }
            reloadTimeout = setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    console.log(`[Auto-reload] Reloading window after ${filename} changed`);
                    mainWindow.reload();
                }
            }, 300);
        });
        console.log('[Auto-reload] Watching for file changes in', distElectronPath);
    }
    catch (error) {
        console.warn('[Auto-reload] Failed to setup file watcher:', error);
    }
}
electron_1.app.whenReady().then(() => {
    (0, handlers_1.registerIpcHandlers)(electron_1.ipcMain, electron_1.dialog, electron_1.shell, { isTestMode });
    createWindow();
    setupAutoReload();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
//# sourceMappingURL=main.js.map