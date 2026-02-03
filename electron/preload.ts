import { contextBridge, ipcRenderer } from 'electron';
import { OrderRequest } from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  sendOrder: (order: OrderRequest) => ipcRenderer.invoke('trade:order', order),
  getAccount: (accountId: string) => ipcRenderer.invoke('trade:account', accountId),
  getPositions: (accountId: string) => ipcRenderer.invoke('trade:positions', accountId),
  getTrades: (accountId: string) => ipcRenderer.invoke('trade:trades', accountId),
  cancelOrder: (accountId: string, orderId: string) => ipcRenderer.invoke('trade:cancel-order', accountId, orderId),
  setFocusSymbol: (symbol: string) => ipcRenderer.send('trade:set-focus', symbol),
  getTickSnapshot: (symbol: string) => ipcRenderer.invoke('trade:get-tick', symbol),
  getStockDetail: (symbol: string) => ipcRenderer.invoke('trade:get-stock-detail', symbol),
  queryPositionsSnapshot: (accountIds?: string[]) => ipcRenderer.invoke('trade:query-positions-snapshot', accountIds),
  queryOrdersSnapshot: (accountIds?: string[]) => ipcRenderer.invoke('trade:query-orders-snapshot', accountIds),

  // Listeners (Return cleanup functions)
  onTick: (callback: any) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on('push:tick', subscription);
    return () => ipcRenderer.removeListener('push:tick', subscription);
  },
  onOrderUpdate: (callback: any) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on('push:order', subscription);
    return () => ipcRenderer.removeListener('push:order', subscription);
  },
  onSystemLog: (callback: (msg: any) => void) => {
    const subscription = (_: any, msg: any) => callback(msg);
    ipcRenderer.on('push:log', subscription);
    return () => ipcRenderer.removeListener('push:log', subscription);
  },
  onAccounts: (callback: (accounts: any[]) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on('push:accounts', subscription);
    return () => ipcRenderer.removeListener('push:accounts', subscription);
  },
  onAssetsSnapshot: (callback: (data: any[]) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on('push:assets-snapshot', subscription);
    return () => ipcRenderer.removeListener('push:assets-snapshot', subscription);
  },
  onPositionsSnapshot: (callback: (data: any[]) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on('push:positions-snapshot', subscription);
    return () => ipcRenderer.removeListener('push:positions-snapshot', subscription);
  },
  onOrdersSnapshot: (callback: (data: any[]) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on('push:orders-snapshot', subscription);
    return () => ipcRenderer.removeListener('push:orders-snapshot', subscription);
  },

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
});