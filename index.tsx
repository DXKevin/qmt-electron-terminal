import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { IElectronAPI, OrderStatus } from './types';

// ----------------------------------------------------------------------
// MOCK API: Enables the UI to run in a browser without Electron
// ----------------------------------------------------------------------
if (!window.electronAPI) {
  console.warn("Electron API not found. Initializing Mock API for browser preview.");

  const listeners: Record<string, Function[]> = {};
  const emit = (event: string, data: any) => {
    if (listeners[event]) {
      listeners[event].forEach(cb => cb(data));
    }
  };

  // Shared state for the mock
  let activeSymbol = "600000.SH";

  // Mock Name Lookup
  const getName = (code: string) => {
    if (code.startsWith('600000')) return '浦发银行';
    if (code.startsWith('600519')) return '贵州茅台';
    if (code.startsWith('000001')) return '平安银行';
    return '未知股票';
  };

  const mockAPI: IElectronAPI = {
    sendOrder: async (order) => {
      console.log("[Mock] Order Received:", order);
      setTimeout(() => {
        const orderId = "ORD" + Math.floor(Math.random() * 10000);
        const orderUpdate: OrderStatus = {
          orderId,
          orderTime: new Date().toLocaleTimeString(),
          symbol: order.symbol,
          stockName: getName(order.symbol),
          action: order.order_type === 'buy' ? 'BUY' : 'SELL',
          price: order.price,
          volume: order.volume,
          status: 'FILLED',
          filledVolume: order.volume,
          msg: '模拟成交'
        };
        emit('order', orderUpdate);
      }, 1000);
      return { success: true, data: "ORD_PENDING_" + Date.now() };
    },

    getAccount: async (_accountId) => {
      return {
        success: true,
        data: {
          accountId: "MOCK_ACC_888",
          assets: 1250000.50,
          marketValue: 800000.00,
          cash: 450000.50
        }
      };
    },

    getPositions: async (_accountId) => {
      return {
        success: true,
        data: [
          { accountId: "888001", symbol: "600000.SH", stockName: "浦发银行", volume: 5000, canUseVolume: 5000, openPrice: 9.85, marketValue: 51250 },
          { accountId: "888001", symbol: "600519.SH", stockName: "贵州茅台", volume: 200, canUseVolume: 200, openPrice: 1750.00, marketValue: 350000 },
          { accountId: "888002", symbol: "000001.SZ", stockName: "平安银行", volume: 10000, canUseVolume: 0, openPrice: 12.30, marketValue: 125000 },
        ]
      };
    },

    getTrades: async (_accountId) => {
      return {
        success: true,
        data: [
          { time: "09:30:05", symbol: "600000.SH", stockName: "浦发银行", action: 'BUY', price: 9.80, volume: 1000, amount: 9800 },
          { time: "09:35:12", symbol: "000001.SZ", stockName: "平安银行", action: 'SELL', price: 12.50, volume: 500, amount: 6250 },
        ]
      };
    },

    subscribe: async (symbol) => {
      console.log("[Mock] Subscribe:", symbol);
      activeSymbol = symbol;
      return { success: true };
    },

    onTick: (callback) => {
      // Mock static data for consistent display
      const preClose = 5.13;

      setInterval(() => {
        const noise = (Math.random() - 0.5) * 0.1;
        const lastPrice = 4.88 + noise; // Match screenshot roughly

        const asks: [number, number][] = [];
        for (let i = 1; i <= 5; i++) {
          asks.push([lastPrice + i * 0.01, Math.floor(Math.random() * 2000) + 100]);
        }
        const bids: [number, number][] = [];
        for (let i = 1; i <= 5; i++) {
          bids.push([lastPrice - i * 0.01, Math.floor(Math.random() * 2000) + 100]);
        }

        callback({
          symbol: activeSymbol,
          stockName: getName(activeSymbol),
          lastPrice: parseFloat(lastPrice.toFixed(2)),
          volume: Math.floor(Math.random() * 500000),
          time: new Date().toLocaleTimeString(),
          asks,
          bids,
          // Extended Mock Data matching screenshot style
          preClose: preClose,
          open: 5.06,
          high: 5.07,
          low: 4.88,
          // Limit Up/Down fixed values
          limitUp: parseFloat((preClose * 1.1).toFixed(2)),
          limitDown: parseFloat((preClose * 0.9).toFixed(2)),
          amount: 1853000000, // 18.53亿
          totalValue: 58222000000, // 582.22亿
          currencyValue: 47416000000, // 474.16亿
          pe: "亏损",
          volRatio: 1.18,
          turnoverRate: 3.85
        });
      }, 1000);
    },

    onOrderUpdate: (callback) => {
      if (!listeners['order']) listeners['order'] = [];
      listeners['order'].push(callback);
    },

    onSystemLog: (callback) => {
      setTimeout(() => callback("外部交易核心已连接 (Browser Mode)"), 500);
    },

    // Window Controls Mock
    minimizeWindow: async () => console.log("[Mock] Minimize Window"),
    maximizeWindow: async () => console.log("[Mock] Maximize Window"),
    closeWindow: async () => console.log("[Mock] Close Window"),
  };

  window.electronAPI = mockAPI;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);