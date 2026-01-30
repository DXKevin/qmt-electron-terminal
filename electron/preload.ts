import { contextBridge, ipcRenderer } from 'electron';
import { OrderRequest } from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  sendOrder: (order: OrderRequest) => ipcRenderer.invoke('trade:order', order),
  getAccount: (accountId: string) => ipcRenderer.invoke('trade:account', accountId),
  getPositions: (accountId: string) => ipcRenderer.invoke('trade:positions', accountId),
  getTrades: (accountId: string) => ipcRenderer.invoke('trade:trades', accountId),
  subscribe: (symbol: string) => ipcRenderer.invoke('trade:subscribe', symbol),
  
  // Listeners
  onTick: (callback: any) => ipcRenderer.on('push:tick', (_, data) => callback(data)),
  onOrderUpdate: (callback: any) => ipcRenderer.on('push:order', (_, data) => callback(data)),
  onSystemLog: (callback: any) => ipcRenderer.on('push:log', (_, msg) => callback(msg)),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
});