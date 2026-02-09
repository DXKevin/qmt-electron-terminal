
// Action Types matched in Python RequestHandlerThread
export enum ActionType {
  PLACE_ORDER = 'place_order',
  CANCEL_ORDER = 'cancel_order',
  QUERY_ORDERS = 'query_orders',
  QUERY_TRADES = 'query_trades',
  QUERY_POSITIONS = 'query_positions',
  QUERY_ASSETS = 'query_assets',
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

export interface StockDetail {
  symbol: string;
  name: string;
  upLimit: number;
  downLimit: number;
}

export interface AccountInfo {
  accountId: string;
  assets: number;
  marketValue: number;
  cash: number;
}

export interface MultiAccountInfo {
  account_id: string;
  account_type: number;
  broker_type: number;
  platform_id: number;
  account_classification: number;
  login_status: number;
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
  tradeTimestamp: number;
  tradeTime: string;
  tradeId: string;
  accountId: string;
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
  orderSysId: string; // order_sysid from backend
  accountId: string;
  orderTime: string;
  symbol: string;
  stockName: string;
  action: 'BUY' | 'SELL';
  status: 'SUBMITTED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'UNREPORTED' | 'WAIT_REPORTING' | 'REPORTED' | 'REPORTED_CANCEL' | 'PARTSUCC_CANCEL' | 'PART_CANCEL' | 'PART_SUCC' | 'JUNK' | 'UNKNOWN';
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
  cancelOrder: (accountId: string, orderSysId: string, marketType: 'sh' | 'sz') => Promise<ApiResponse<any>>;
  setFocusSymbol: (symbol: string) => void;
  getTickSnapshot: (symbol: string) => Promise<TickData | null>;

  onTick: (callback: (data: TickData) => void) => () => void;
  onAllTicks: (callback: (data: Record<string, TickData>) => void) => () => void;
  onSystemLog: (callback: (msg: string) => void) => () => void;
  onAccounts: (callback: (accounts: MultiAccountInfo[]) => void) => () => void;
  onAssetsSnapshot: (callback: (assets: any[]) => void) => () => void;
  onPositionsSnapshot: (callback: (positions: Position[]) => void) => () => void;
  onOrdersSnapshot: (callback: (orders: OrderStatus[]) => void) => () => void;
  onTradesSnapshot: (callback: (trades: Trade[]) => void) => () => void;
  getStockDetail: (symbol: string) => Promise<StockDetail | null>;
  getCachedAccounts: () => Promise<any[]>;
  queryPositionsSnapshot: (accountIds?: string[]) => Promise<void>;
  queryOrdersSnapshot: (accountIds?: string[]) => Promise<void>;
  queryTradesSnapshot: (accountIds?: string[]) => Promise<void>;

  // Order callbacks for Toast notifications
  onOrderAsyncResponse: (callback: (data: any[]) => void) => () => void;
  onCancelOrderAsyncResponse: (callback: (data: any[]) => void) => () => void;
  onOrderUpdate: (callback: (data: OrderStatus) => void) => () => void;
  onTradeUpdate: (callback: (data: Trade) => void) => () => void;
  onOrderUpdateError: (callback: (data: any) => void) => () => void;
  onCancelOrderUpdateError: (callback: (data: any) => void) => () => void;

  // Window Controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

export interface TradeSettings {
  buyPresets: number[];
  sellPresets: number[];
  volumeStep: number;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}