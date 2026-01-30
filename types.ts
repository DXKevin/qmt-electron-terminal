
// Action Types matched in Python RequestHandlerThread
export enum ActionType {
  PLACE_ORDER = 'place_order',
  CANCEL_ORDER = 'cancel_order',
  QUERY_ORDERS = 'query_orders',
  QUERY_TRADES = 'query_trades',
  QUERY_POSITIONS = 'query_positions',
  QUERY_ASSETS = 'query_assets',
  SUBSCRIBE = 'subscribe' // Assuming this exists elsewhere in Python
}

// QMT Specific Data Structures
export interface TickData {
  symbol: string;
  stockName?: string;
  lastPrice: number;
  volume: number;
  time: string;
  asks: [number, number][];
  bids: [number, number][];

  preClose?: number;
  open?: number;
  high?: number;
  low?: number;
  limitUp?: number;
  limitDown?: number;
  amount?: number;
  totalValue?: number;
  currencyValue?: number;
  pe?: number | string;
  volRatio?: number;
  turnoverRate?: number;
}

export interface AccountInfo {
  accountId: string;
  assets: number;
  marketValue: number;
  cash: number;
}

export interface Position {
  accountId: string;
  symbol: string;
  stockName: string;
  volume: number;
  canUseVolume: number;
  openPrice: number;
  marketValue: number;
}

export interface Trade {
  time: string;
  symbol: string;
  stockName: string;
  action: 'BUY' | 'SELL';
  price: number;
  volume: number;
  amount: number;
}

// Matches Python _handle_place_order params
export interface OrderRequest {
  account_id: string;
  symbol: string;
  order_type: 'buy' | 'sell';
  price_type: 'limit' | 'market';
  price: number;
  volume: number;
  strategy_name?: string;
  remark?: string;
}

export interface OrderStatus {
  orderId: string;
  orderTime: string;
  symbol: string;
  stockName: string;
  action: 'BUY' | 'SELL';
  status: 'SUBMITTED' | 'FILLED' | 'CANCELED' | 'REJECTED';
  price: number;
  volume: number;
  filledVolume: number;
  msg: string;
}

// Standard API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// IPC Interface exposed to Renderer
export interface IElectronAPI {
  sendOrder: (order: OrderRequest) => Promise<ApiResponse<any>>;
  getAccount: (accountId: string) => Promise<ApiResponse<AccountInfo>>;
  getPositions: (accountId: string) => Promise<ApiResponse<Position[]>>;
  getTrades: (accountId: string) => Promise<ApiResponse<Trade[]>>;
  subscribe: (symbol: string) => Promise<ApiResponse<any>>;

  onTick: (callback: (data: TickData) => void) => void;
  onOrderUpdate: (callback: (data: OrderStatus) => void) => void;
  onSystemLog: (callback: (msg: string) => void) => void;

  // Window Controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}