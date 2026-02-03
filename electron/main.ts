import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { PythonBridge } from './bridge';
import { OrderRequest, ActionType } from '../types';

declare const __dirname: string;
declare const process: any;

let mainWindow: BrowserWindow | null = null;
let bridge: PythonBridge | null = null;

// Tick Cache & Focus logic
const tickMap = new Map<string, any>();
const stockDetailMap = new Map<string, any>();
let focusSymbol = '';

// Asset Polling logic
let managedAccountIds: string[] = [];
let assetPollingInterval: NodeJS.Timeout | null = null;
const globalAssetsMap = new Map<string, any>();

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

  // Helper: Safely send data to renderer
  const safeSend = (channel: string, ...args: any[]) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  };

  // Forward Bridge Events to Renderer
  bridge.on('tick_data_update', (data: any) => {
    // Format: data = [ { "301638.SZ": {...}, "000001.SZ": {...}, ... } ]
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) return;

    // Get the giant dictionary (usually the first element)
    const allTicks = list[0];
    if (typeof allTicks !== 'object' || allTicks === null) return;

    for (const [symbol, rawData] of Object.entries(allTicks)) {
      if (typeof rawData !== 'object' || rawData === null) continue;
      const rt = rawData as any;

      // 1. Map Backend fields to Frontend TickData structure
      const tick = {
        symbol: symbol,
        lastPrice: rt.lastPrice || 0,
        volume: rt.volume || 0,
        amount: rt.amount || 0,
        time: rt.timetag || (rt.time ? rt.time.toString() : ''),
        preClose: rt.lastClose || 0,
        open: rt.open || 0,
        high: rt.high || 0,
        low: rt.low || 0,
        // Zip askPrice/askVol -> [[p1, v1], ...]
        asks: (rt.askPrice || []).map((p: number, i: number) => [p, rt.askVol?.[i] || 0]),
        bids: (rt.bidPrice || []).map((p: number, i: number) => [p, rt.bidVol?.[i] || 0]),
        ...rt
      };

      // 2. Storage logic (Cache everything)
      tickMap.set(symbol, tick);

      // 3. Selective Push (Only push the one we are looking at)
      if (symbol === focusSymbol) {
        safeSend('push:tick', tick);
      }
    }
  });

  bridge.on('order_update', (data) => safeSend('push:order', data));
  bridge.on('orders_snapshot', (data: any) => {
    console.log("[Main] Received orders_snapshot data:", Array.isArray(data) ? `Array(${data.length})` : typeof data);

    const rawList = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);

    const cleanList = rawList.map((item: any) => {
      const detail = stockDetailMap.get(item.symbol);

      // Status Mapping based on QMT codes
      let statusString = 'UNKNOWN';
      switch (item.order_status) {
        case 48: statusString = 'UNREPORTED'; break;       // 未报
        case 49: statusString = 'WAIT_REPORTING'; break;   // 待报
        case 50: statusString = 'REPORTED'; break;         // 已报
        case 51: statusString = 'REPORTED_CANCEL'; break;  // 已报待撤
        case 52: statusString = 'PARTSUCC_CANCEL'; break;  // 部成待撤
        case 53: statusString = 'PART_CANCEL'; break;      // 部撤
        case 54: statusString = 'CANCELED'; break;         // 已撤
        case 55: statusString = 'PART_SUCC'; break;        // 部成 (Partially Filled)
        case 56: statusString = 'FILLED'; break;           // 已成
        case 57: statusString = 'JUNK'; break;             // 废单
        default: statusString = 'UNKNOWN'; break;
      }

      // Determine Action
      const action = (item.order_type === 23) ? 'BUY' : 'SELL';

      // Time formatting (unix timestamp to HH:mm:ss)
      let timeStr = item.order_time ? new Date(item.order_time * 1000).toLocaleTimeString() : '';

      return {
        orderId: item.order_sysid || String(item.order_id), // Use sysid if available
        orderSysId: item.order_sysid || String(item.order_id), // Explicit orderSysId for deduplication
        accountId: item.account_id,
        orderTime: timeStr,
        symbol: item.symbol,
        stockName: detail ? detail.name : item.symbol,
        action: action,
        status: statusString,
        price: item.price,
        volume: item.order_volume,
        filledVolume: item.traded_volume,
        msg: item.status_msg || ''
      };
    });

    safeSend('push:orders-snapshot', cleanList);
  });
  bridge.on('account_infos', (data: any[]) => {
    console.log(`[Main] account_infos event received. Count: ${data?.length}`);
    // 1. Forward to frontend
    safeSend('push:accounts', data);

    // 2. Start polling for these accounts
    const newIds = (Array.isArray(data) ? data : []).map(acc => acc.account_id).filter(Boolean);
    managedAccountIds = [...new Set([...managedAccountIds, ...newIds])];

    console.log(`[Main] Managed accounts for polling: [${managedAccountIds.join(', ')}]`);

    if (managedAccountIds.length > 0 && !assetPollingInterval) {
      console.log(`[Main] Initializing Asset Polling Timer (6s interval)...`);
      assetPollingInterval = setInterval(() => {
        if (!bridge) return;
        console.log(`[Main] [Polling-Tick] Triggering query for ${managedAccountIds.length} accounts`);
        managedAccountIds.forEach((id, index) => {
          // Stagger requests slightly to avoid pipe saturation
          setTimeout(() => {
            if (!bridge) return;
            console.log(`[Main] [Polling-Task] Sending query_assets for: ${id}`);
            (bridge as any).sendNotify(ActionType.QUERY_ASSETS, { account_id: id });
          }, index * 200);
        });
      }, 6000);

      // Initial trigger
      managedAccountIds.forEach((id, index) => {
        setTimeout(() => (bridge as any).sendNotify(ActionType.QUERY_ASSETS, { account_id: id }), index * 200);
      });
    }
  });

  bridge.on('assets_snapshot', (dataArray: any) => {
    // Backend gives data: [{'account_id': '...', ...}]
    const list = Array.isArray(dataArray) ? dataArray : [];
    console.log(`[Main] [DATA] assets_snapshot received. Items: ${list.length}`);

    let hasChanged = false;
    list.forEach(raw => {
      const id = raw.account_id;
      if (!id) return;

      const oldStr = JSON.stringify(globalAssetsMap.get(id));
      const newStr = JSON.stringify(raw);

      if (oldStr !== newStr) {
        globalAssetsMap.set(id, raw);
        hasChanged = true;
      }
    });

    if (hasChanged) {
      // Push the entire collection to keep frontend in sync
      safeSend('push:assets-snapshot', Array.from(globalAssetsMap.values()));
    }
  });
  bridge.on('stock_detail_map', (data: any) => {
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) return;
    const details = list[0];
    if (typeof details !== 'object' || details === null) return;

    for (const [symbol, info] of Object.entries(details)) {
      if (typeof info !== 'object' || info === null) continue;
      const si = info as any;
      stockDetailMap.set(symbol, {
        symbol,
        name: si.InstrumentName,
        upLimit: si.UpStopPrice,
        downLimit: si.DownStopPrice
      });
    }
    console.log(`[Main] Stock details updated: ${stockDetailMap.size} stocks.`);
    console.log(`[Main] Stock details updated: ${stockDetailMap.size} stocks.`);
  });

  bridge.on('positions_snapshot', (data: any) => {
    // bridge.ts emits `msg.data` directly, so `data` is the array of positions
    console.log("[Main] Received positions_snapshot data:", Array.isArray(data) ? `Array(${data.length})` : typeof data);

    // Fallback: if for some reason it's the full object (future proofing), check data property
    const rawList = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);

    const cleanList = rawList.map((item: any) => {
      // Map fields to frontend Position interface
      const detail = stockDetailMap.get(item.symbol);
      return {
        accountId: item.account_id,
        symbol: item.symbol,
        stockName: detail ? detail.name : item.symbol, // Enrich name if possible
        volume: item.volume,
        canUseVolume: item.can_use_volume,
        openPrice: item.avg_price, // Use avg_price for cost basis calculation
        marketValue: item.market_value
      };
    });

    safeSend('push:positions-snapshot', cleanList);
  });

  bridge.on('log', (msg) => safeSend('push:log', msg));
  bridge.on('error', (msg) => safeSend('push:log', `[连接错误] ${msg}`));

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

  ipcMain.handle('trade:query-positions-snapshot', async (_, accountIds?: string[]) => {
    if (!bridge) return;

    // Use provided IDs or fallback to known managed IDs
    const targets = (accountIds && accountIds.length > 0) ? accountIds : managedAccountIds;

    console.log(`[Main] Requesting positions snapshot for ${targets.length} accounts...`);

    if (targets.length === 0) {
      console.warn("[Main] No accounts to query positions for.");
      return;
    }

    // Iterate accounts and request positions for each (as "Fire and forget")
    targets.forEach((id, idx) => {
      setTimeout(() => {
        // Use QUERY_POSITIONS as requested by user
        (bridge as any).sendNotify(ActionType.QUERY_POSITIONS, { account_id: id });
      }, idx * 50); // Small stagger to avoid pipe congestion
    });
  });

  ipcMain.handle('trade:query-orders-snapshot', async (_, accountIds?: string[]) => {
    if (!bridge) return;

    // Use provided IDs or fallback to known managed IDs
    const targets = (accountIds && accountIds.length > 0) ? accountIds : managedAccountIds;

    console.log(`[Main] Requesting orders snapshot for ${targets.length} accounts...`);

    if (targets.length === 0) {
      console.warn("[Main] No accounts to query orders for.");
      return;
    }

    targets.forEach((id, idx) => {
      setTimeout(() => {
        (bridge as any).sendNotify(ActionType.QUERY_ORDERS, { account_id: id });
      }, idx * 50);
    });
  });

  // 3. Trades (Keep legacy)
  ipcMain.handle('trade:trades', async (_, accountId: string) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.QUERY_TRADES, { account_id: accountId });
  });

  // 4. Order
  ipcMain.handle('trade:order', async (_, order: OrderRequest) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.PLACE_ORDER, order);
  });

  // 6. Cancel Order
  ipcMain.handle('trade:cancel-order', async (_, accountId: string, orderId: string) => {
    if (!bridge) return { success: false, error: "主进程未就绪" };
    return bridge.sendRequest(ActionType.CANCEL_ORDER, { account_id: accountId, order_id: orderId });
  });

  // 7. Focus Management
  ipcMain.on('trade:set-focus', (_, symbol: string) => {
    focusSymbol = symbol;
    // When switching focus, immediately push current snapshot if it exists
    const snapshot = tickMap.get(symbol);
    if (snapshot) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('push:tick', snapshot);
      }
    }
  });

  // 8. One-off Query
  ipcMain.handle('trade:get-tick', (_, symbol: string) => {
    return tickMap.get(symbol) || null;
  });

  // 9. Stock Details
  ipcMain.handle('trade:get-stock-detail', (_, symbol: string) => {
    return stockDetailMap.get(symbol) || null;
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
  if (assetPollingInterval) clearInterval(assetPollingInterval);
  bridge?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});