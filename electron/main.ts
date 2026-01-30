import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { PythonBridge } from './bridge';
import { OrderRequest, ActionType } from '../types';

declare const __dirname: string;
declare const process: any;

let mainWindow: BrowserWindow | null = null;
let bridge: PythonBridge | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1660,
    height: 1200,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#111827',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // app.isPackaged is false when running via "electron ."
  // This is more reliable than checking NODE_ENV on Windows
  const isDev = !app.isPackaged;

  if (isDev) {
    // Load from Vite dev server
    console.log("Running in Development Mode: Loading http://localhost:5173");
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' }); // Auto open DevTools in dev
  } else {
    // Load from built files
    // In production, structure is: root/resources/app/dist-electron/electron/main.js
    // We need to access root/resources/app/dist/index.html
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Initialize Named Pipe Bridge
  console.log("Initializing QMT Pipe Bridge...");
  bridge = new PythonBridge();

  // Forward Bridge Events to Renderer
  bridge.on('tick', (data) => mainWindow?.webContents.send('push:tick', data));
  bridge.on('order_update', (data) => mainWindow?.webContents.send('push:order', data));
  bridge.on('log', (msg) => mainWindow?.webContents.send('push:log', msg));
  bridge.on('error', (msg) => mainWindow?.webContents.send('push:log', `[连接错误] ${msg}`));

  bridge.start();
}

app.whenReady().then(() => {
  createWindow();

  // IPC Handlers: Map to Python RequestHandlerThread Actions

  // 1. Assets
  ipcMain.handle('trade:account', async (_, accountId: string) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.QUERY_ASSETS, { account_id: accountId });
  });

  // 2. Positions
  ipcMain.handle('trade:positions', async (_, accountId: string) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.QUERY_POSITIONS, { account_id: accountId });
  });

  // 3. Trades
  ipcMain.handle('trade:trades', async (_, accountId: string) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.QUERY_TRADES, { account_id: accountId });
  });

  // 4. Order
  ipcMain.handle('trade:order', async (_, order: OrderRequest) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.PLACE_ORDER, order);
  });

  // 5. Subscribe (Note: Not explicitly in Python snippet, but assuming support)
  ipcMain.handle('trade:subscribe', async (_, symbol: string) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.SUBSCRIBE, { symbol });
  });

  // Window Control Handlers
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
});

app.on('window-all-closed', () => {
  bridge?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});