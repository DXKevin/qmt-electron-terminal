import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TickData, AccountInfo, OrderRequest, OrderStatus, Position, Trade, MultiAccountInfo } from './types';

// ----------------------------------------------------------------------
// TYPES & CONSTANTS
// ----------------------------------------------------------------------

// 数字平滑过渡组件
const AnimatedNumber: React.FC<{ value: number; format?: (v: number) => string; className?: string; duration?: number }> = ({ 
  value, 
  format = (v) => v.toLocaleString(), 
  className = '',
  duration = 300 
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value === prevValueRef.current) return;
    
    prevValueRef.current = value;
    const startValue = displayValue;
    const startTime = performance.now();
    const diff = value - startValue;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // 使用缓动函数使动画更平滑
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      
      const current = startValue + diff * easeOutQuart;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span className={className}>{format(displayValue)}</span>;
};

type TabType = 'assets' | 'trade' | 'orders' | 'trades';
type SortDirection = 'asc' | 'desc';
// Removed LIMIT_UP and LIMIT_DOWN from PriceMode as they are now static fills
type PriceMode = 'LIMIT' | 'BEST_5' | 'OPPOSITE' | 'CAGE';

const STOCK_MAP: Record<string, string> = {};

// Mock Accounts - To be connected to backend data
const MOCK_MULTI_ACCOUNTS: any[] = [];

// Updated Semantic Icons
const Icons = {
  // Assets: Wallet
  Assets: () => <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />,
  // Trade: Exchange / Swap (Buy <-> Sell)
  Trade: () => <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />,
  // Orders: Clipboard List
  Orders: () => <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />,
  // Trades: Receipt / History
  Trades: () => <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />,
  // Logs: Terminal
  Logs: () => <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />,
  // Rocket Logo
  Rocket: () => <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />,
  // UI: Panel Collapse (Double Chevron Left)
  PanelCollapse: () => <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />,
  // UI: Panel Expand (Double Chevron Right)
  PanelExpand: () => <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
}

// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------
const colors = {
  appBg: 'bg-gray-100',
  sidebarBg: 'bg-white border-r border-gray-300',
  contentBg: 'bg-[#f3f4f6]',
  text: 'text-gray-900',
  textMuted: 'text-gray-500',
  border: 'border-gray-300',
  gridLine: 'border-gray-300',
  rowHover: 'hover:bg-blue-50 cursor-pointer',
  activeNav: 'bg-blue-50 text-blue-600 border-l-4 border-blue-600',
  inactiveNav: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
  input: 'bg-white border-gray-300 text-gray-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600',
  card: 'bg-white border border-gray-300 shadow-sm',
  cardHeader: 'bg-gray-50 border-b border-gray-300',
  hoverHighlight: 'hover:bg-gray-100 active:bg-gray-200',
};

type VolumeStrategy =
  | { type: 'MANUAL', value: string }
  | { type: 'RATIO', value: number, label: string }
  | { type: 'AMOUNT', value: number, label: string };

export const App: React.FC = () => {
  // Data State
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<OrderStatus[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  // 存储所有股票的完整行情数据
  const [priceMap, setPriceMap] = useState<Record<string, TickData>>({});

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('trade');
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY'); // Track active side
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true); // New Sidebar State

  // Multi-Account State
  const [multiAccounts, setMultiAccounts] = useState<MultiAccountInfo[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showCancellableOnly, setShowCancellableOnly] = useState(true); // Filter state
  const [assetsMap, setAssetsMap] = useState<Record<string, AccountInfo>>({});

  // Trade Form State
  const [symbol, setSymbol] = useState('600000.SH');
  const [stockName, setStockName] = useState('浦发银行');
  const [price, setPrice] = useState<string>('');

  // --- VOLUME STRATEGY STATE ---
  const [volStrategy, setVolStrategy] = useState<VolumeStrategy>({
    type: 'MANUAL',
    value: ''
  });

  // --- AMOUNT INPUT STATE ---
  const [amountInWan, setAmountInWan] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceType, setPriceType] = useState<PriceMode>('CAGE'); // Track price mode

  // Window Controls State
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 确认面板状态
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmOrderInfo, setConfirmOrderInfo] = useState<{
    accounts: { id: string; volume: number; amount: number }[];
    symbol: string;
    action: 'BUY' | 'SELL';
    price: number;
  } | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Toast notification state
  interface ToastItem {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error';
  }
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [currentToast, setCurrentToast] = useState<ToastItem | null>(null);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const toast: ToastItem = { id: Date.now(), message, type };
    setToastQueue(prev => [...prev, toast]);
  }, []);

  // Toast queue processor
  useEffect(() => {
    if (toastQueue.length === 0) return;
    if (currentToast) return;
    setCurrentToast(toastQueue[0]);
    setToastQueue(prev => prev.slice(1));
  }, [toastQueue, currentToast]);

  // Auto dismiss timer
  useEffect(() => {
    if (!currentToast) return;
    const timer = setTimeout(() => setCurrentToast(null), 1000);
    return () => clearTimeout(timer);
  }, [currentToast]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Helper function to generate unique order key
  const getOrderUniqueKey = useCallback((order: OrderStatus) => `${order.accountId}_${order.orderSysId}`, []);

  const isFirstMount = useRef(true);

  const onOrdersSnapshot = useCallback((newOrders: OrderStatus[]) => {
    setOrders(prev => {
      if (!newOrders || newOrders.length === 0) return prev;

      // Use accountId + orderSysId as unique key to prevent duplicates
      const getUniqueKey = (order: OrderStatus) => `${order.accountId}_${order.orderSysId}`;

      // Create a map of existing orders by unique key
      const existingMap = new Map(prev.map(o => [getUniqueKey(o), o]));

      // Update or add new orders (incremental update to reduce flickering)
      newOrders.forEach(newOrder => {
        const key = getUniqueKey(newOrder);
        const existing = existingMap.get(key);

        // Only update if the order has actually changed (deep comparison of key fields)
        if (!existing ||
          existing.status !== newOrder.status ||
          existing.filledVolume !== newOrder.filledVolume ||
          existing.price !== newOrder.price) {
          existingMap.set(key, newOrder);
        }
      });

      return Array.from(existingMap.values());
    });
  }, [addLog]);

  const fetchData = async () => {
    // Actively request a snapshot from Python if we have accounts
    if (multiAccounts.length > 0) {
      const ids = multiAccounts.map(a => a.account_id);
      addLog(`正在请求持仓、委托与成交快照...`);
      window.electronAPI.queryPositionsSnapshot(ids);
      window.electronAPI.queryOrdersSnapshot(ids);
      window.electronAPI.queryTradesSnapshot(ids);
    } else {
      addLog(`暂无账户信息，跳过请求`);
    }
  };

  // Initialize listeners
  useEffect(() => {
    const unsubLog = window.electronAPI.onSystemLog((msg) => {
      addLog(msg);
      if (msg === "交易核心连接成功") {
        fetchData();
      }
    });

    // 接收所有股票的完整行情数据
    const unsubAllTicks = window.electronAPI.onAllTicks((allTicks) => {
      setPriceMap(allTicks as Record<string, TickData>);
    });

    const unsubOrder = window.electronAPI.onOrderUpdate((order) => {
      setOrders(prev => {
        const idx = prev.findIndex(o => o.orderId === order.orderId);
        if (idx >= 0) {
          const newOrders = [...prev];
          newOrders[idx] = order;
          return newOrders;
        }
        return [order, ...prev];
      });
      // Also update positions/trades if filled
      if (order.status === 'FILLED') fetchData();
      addLog(`委托更新: ${order.symbol} ${order.status}`);
    });

    // Order callbacks for Toast notifications
    const unsubOrderAsyncResponse = window.electronAPI.onOrderAsyncResponse((data) => {
      const item = data[0];
      const icon = item?.error_id !== 0 ? '❌' : '✅';
      const status = item?.error_id !== 0 ? '提交失败' : '提交成功';
      const detail = item?.error_msg ? `\n${item.error_msg}` : '';
      addToast(`[QMT交易系统回调]\n${icon} 订单 ${item?.order_id} ${status}${detail}`, item?.error_id !== 0 ? 'error' : 'success');
    });

    const unsubCancelOrderAsyncResponse = window.electronAPI.onCancelOrderAsyncResponse((data) => {
      const item = data[0];
      const icon = item?.cancel_result !== 0 ? '❌' : '✅';
      const status = item?.cancel_result !== 0 ? '撤单失败' : '撤单请求已发送';
      const orderId = item?.order_sysid || item?.order_id;
      addToast(`[QMT交易系统回调]\n${icon} 合同号 ${orderId} ${status}`, item?.cancel_result !== 0 ? 'error' : 'success');
    });

    const unsubTradeUpdate = window.electronAPI.onTradeUpdate((trade) => {
      addToast(`成交: ${trade.symbol} ${trade.action} ${trade.volume}股`, 'info');
    });

    const unsubOrderUpdateError = window.electronAPI.onOrderUpdateError((data) => {
      const item = data[0];
      const detail = item?.error_msg ? `\n${item.error_msg}` : '';
      addToast(`[QMT交易系统回调]\n❌ 订单 ${item?.order_id} 错误(${item?.error_id})${detail}`, 'error');
    });

    const unsubCancelOrderUpdateError = window.electronAPI.onCancelOrderUpdateError((data) => {
      addToast(`撤单更新错误: ${data.error_msg || JSON.stringify(data)}`, 'error');
    });

    // Query cached accounts first, then listen for updates
    window.electronAPI.getCachedAccounts().then((cached) => {
      if (cached && cached.length > 0) {
        console.log('[Renderer] 使用缓存账户信息:', cached.length, '个');
        setMultiAccounts(cached);
        setSelectedAccountIds(prev => prev.length === 0 && cached.length > 0 ? [cached[0].account_id] : prev);
        addLog(`系统已加载 ${cached.length} 个资金账户（缓存）`);
        const ids = cached.map(a => a.account_id);
        window.electronAPI.queryPositionsSnapshot(ids);
        window.electronAPI.queryOrdersSnapshot(ids);
        window.electronAPI.queryTradesSnapshot(ids);
      }
    });

    const unsubAccounts = window.electronAPI.onAccounts((accounts) => {
      console.log('[Renderer] 收到账户推送:', accounts.length, '个');
      setMultiAccounts(accounts);
      // Auto-select first account if none selected
      setSelectedAccountIds(prev => prev.length === 0 && accounts.length > 0 ? [accounts[0].account_id] : prev);
      addLog(`系统已加载 ${accounts.length} 个资金账户`);
      // 收到账户信息后立即查询持仓和委托
      if (accounts.length > 0) {
        const ids = accounts.map(a => a.account_id);
        window.electronAPI.queryPositionsSnapshot(ids);
        window.electronAPI.queryOrdersSnapshot(ids);
        window.electronAPI.queryTradesSnapshot(ids);
      }
    });

    const unsubAssetsSnapshot = window.electronAPI.onAssetsSnapshot((dataArray) => {
      const updates: Record<string, AccountInfo> = {};
      const newAccountIds: string[] = [];

      dataArray.forEach((raw: any) => {
        const info: AccountInfo = {
          accountId: raw.account_id,
          assets: raw.total_asset || 0,
          marketValue: raw.market_value || 0,
          cash: raw.cash || 0
        };
        updates[info.accountId] = info;
        newAccountIds.push(info.accountId);
      });

      setAssetsMap(prev => ({ ...prev, ...updates }));

      // Fallback: Ensure multiAccounts is populated if we receive assets but missed initial account push
      setMultiAccounts(prev => {
        const existingIds = new Set(prev.map(a => a.account_id));
        const missingAccounts: any[] = [];

        newAccountIds.forEach(id => {
          if (!existingIds.has(id)) {
            // Create a placeholder account entry
            missingAccounts.push({
              account_id: id,
              account_type: 2, // Default to Stock
              broker_type: 0,
              platform_id: 0,
              account_classification: 0,
              login_status: 0
            });
          }
        });

        if (missingAccounts.length > 0) {
          return [...prev, ...missingAccounts];
        }
        return prev;
      });

      // If the currently "active" account (first selected) is in this snapshot, update the main header
      setSelectedAccountIds(currentSelected => {
        const activeId = currentSelected[0];
        // Auto-select first found account if nothing selected
        if (currentSelected.length === 0 && newAccountIds.length > 0) {
          return [newAccountIds[0]];
        }
        if (activeId && updates[activeId]) {
          setAccount(updates[activeId]);
        }
        return currentSelected;
      });

      // 收到资产快照后也立即查询持仓和委托（以防 onAccounts 还没触发）
      if (newAccountIds.length > 0) {
        window.electronAPI.queryPositionsSnapshot(newAccountIds);
        window.electronAPI.queryOrdersSnapshot(newAccountIds);
        window.electronAPI.queryTradesSnapshot(newAccountIds);
      }
    });

    const unsubPositionsSnapshot = window.electronAPI.onPositionsSnapshot((newPositions) => {
      // 只有数据真正变化时才更新
      setPositions(prev => {
        if (!newPositions || newPositions.length === 0) return prev;

        const accountId = newPositions[0].accountId;
        const existingIndex = prev.findIndex(p => p.accountId === accountId);

        // 如果已有相同数据且没有变化，跳过更新
        if (existingIndex >= 0) {
          const existingPos = prev[existingIndex];
          const newPos = newPositions[0];
          const isSameData =
            existingPos.accountId === newPos.accountId &&
            existingPos.symbol === newPos.symbol &&
            existingPos.volume === newPos.volume &&
            existingPos.marketValue === newPos.marketValue &&
            existingPos.canUseVolume === newPos.canUseVolume &&
            existingPos.openPrice === newPos.openPrice &&
            existingPos.stockName === newPos.stockName;

          if (isSameData && prev.length === newPositions.length) {
            // 检查所有持仓是否都相同
            let allSame = true;
            for (let i = 0; i < prev.length; i++) {
              const p1 = prev[i];
              const p2 = newPositions[i];
              if (!p2 ||
                  p1.accountId !== p2.accountId ||
                  p1.symbol !== p2.symbol ||
                  p1.volume !== p2.volume ||
                  p1.marketValue !== p2.marketValue ||
                  p1.canUseVolume !== p2.canUseVolume) {
                allSame = false;
                break;
              }
            }
            if (allSame) return prev; // 数据完全相同，跳过更新
          }
        }

        // 移除旧数据，添加新数据
        const others = prev.filter(p => p.accountId !== accountId);
        return [...others, ...newPositions];
      });
    });

    const unsubOrdersSnapshot = window.electronAPI.onOrdersSnapshot(onOrdersSnapshot);

    const unsubTradesSnapshot = window.electronAPI.onTradesSnapshot((newTrades) => {
      setTrades(prev => {
        if (!newTrades || newTrades.length === 0) return prev;
        return newTrades;
      });
    });

    if (isFirstMount.current) {
      // fetchData(); // Removed initial call to prevent "Not Connected" errors
      window.electronAPI.setFocusSymbol(symbol);
      isFirstMount.current = false;
    }

    return () => {
      unsubLog();
      unsubAllTicks();
      unsubOrder();
      unsubOrderAsyncResponse();
      unsubCancelOrderAsyncResponse();
      unsubTradeUpdate();
      unsubOrderUpdateError();
      unsubCancelOrderUpdateError();
      unsubAccounts();
      unsubAssetsSnapshot();
      unsubPositionsSnapshot();
      unsubOrdersSnapshot();
      unsubTradesSnapshot();
    };
  }, [addLog]);

  // DYNAMIC PRICE UPDATE LOGIC
  useEffect(() => {
    // If manual limit, do nothing
    if (priceType === 'LIMIT') return;

    const tick = priceMap[symbol] || null;
    if (!tick) return;

    const detail = window.electronAPI.getStockDetail(symbol).then(detail => {
      const detailData = detail ? { upLimit: detail.upLimit, downLimit: detail.downLimit } : null;
      const calcPrice = calculateAutoPrice(priceType, tick, tradeSide, detailData);
      if (calcPrice) {
        setPrice(calcPrice);
      }
    });
  }, [priceMap, priceType, tradeSide, symbol]);

  // 价格变化时同步更新 AMOUNT 模式的 label
  useEffect(() => {
    if (volStrategy.type === 'AMOUNT' && price) {
      const vol = calculateVolumeFromAmount(volStrategy.value, parseFloat(price));
      setVolStrategy(prev => ({
        ...prev,
        label: `${vol.toLocaleString()}股`
      }));
    }
  }, [price]);


  // Polling positions & orders & trades every 5 seconds
  useEffect(() => {
    if (multiAccounts.length === 0) return;

    const timer = setInterval(() => {
      const ids = multiAccounts.map(a => a.account_id);
      window.electronAPI.queryPositionsSnapshot(ids);
      window.electronAPI.queryOrdersSnapshot(ids);
      window.electronAPI.queryTradesSnapshot(ids);
    }, 5000);

    return () => clearInterval(timer);
  }, [multiAccounts]);

  // ----------------------------------------------------------------
  // WINDOW CONTROL LOGIC
  // ----------------------------------------------------------------
  const handleMinimize = () => window.electronAPI.minimizeWindow();
  const handleMaximize = () => window.electronAPI.maximizeWindow();
  const handleCloseRequest = () => setShowExitConfirm(true);
  const handleConfirmExit = () => window.electronAPI.closeWindow();
  const handleCancelExit = () => setShowExitConfirm(false);

  // ----------------------------------------------------------------
  // LOGIC
  // ----------------------------------------------------------------

  const calculateAutoPrice = (mode: PriceMode, tick: TickData, side: 'BUY' | 'SELL', detail: { upLimit: number; downLimit: number } | null): string | null => {
    const curPrice = tick.lastPrice;
    const asks = tick.asks || [];
    const bids = tick.bids || [];
    let target = 0;

    if (side === 'BUY') {
      switch (mode) {
        case 'BEST_5': // Buy: Ask 5 (Aggressive)
          if (asks.length >= 5) target = asks[4][0];
          else if (asks.length > 0) target = asks[asks.length - 1][0];
          else target = curPrice;
          break;
        case 'OPPOSITE': // Buy: Ask 1
          if (asks.length > 0) target = asks[0][0];
          else target = curPrice;
          break;
        case 'CAGE': // Buy: 当前价上浮2%，但不超过涨停价
          if (detail) {
            target = Math.min(curPrice * 1.019, detail.upLimit);
          }
          break;
        default: return null;
      }
    } else {
      // SELL
      switch (mode) {
        case 'BEST_5': // Sell: Bid 5 (Aggressive)
          if (bids.length >= 5) target = bids[4][0];
          else if (bids.length > 0) target = bids[bids.length - 1][0];
          else target = curPrice;
          break;
        case 'OPPOSITE': // Sell: Bid 1
          if (bids.length > 0) target = bids[0][0];
          else target = curPrice;
          break;
        case 'CAGE': // Sell: 当前价下浮2%，但不低于跌停价
          if (detail) {
            target = Math.max(curPrice * 0.981, detail.downLimit);
          }
          break;
        default: return null;
      }
    }
    return target > 0 ? target.toFixed(2) : null;
  };

  const handleSymbolChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();

    const nativeEvent = e.nativeEvent as unknown as InputEvent;
    const isDeleting = nativeEvent.inputType && nativeEvent.inputType.startsWith('delete');

    if (!isDeleting && /^\d{6}$/.test(val)) {
      if (val.startsWith('6') || val.startsWith('9')) val += '.SH';
      else if (val.startsWith('0') || val.startsWith('3')) val += '.SZ';
      else if (val.startsWith('8') || val.startsWith('4')) val += '.BJ';
    }
    setSymbol(val);

    const code = val.split('.')[0];
    if (code.length === 6) {
      const detail = await window.electronAPI.getStockDetail(val);
      if (detail) {
        setStockName(detail.name);
      } else {
        const name = STOCK_MAP[code] || "未知";
        setStockName(name);
      }
      if (val.includes('.')) window.electronAPI.setFocusSymbol(val);
    } else {
      setStockName("");
    }
  };

  const handleToggleAccount = (id: string) => {
    setSelectedAccountIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccountIds.length === MOCK_MULTI_ACCOUNTS.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(MOCK_MULTI_ACCOUNTS.map(a => a.id));
    }
  };

  const handlePriceAdjust = (direction: 1 | -1) => {
    setPriceType('LIMIT'); // Switch to manual
    const val = parseFloat(price) || currentPrice;
    if (!val) return;
    const step = Math.max(val * 0.001, 0.01);
    const newVal = val + (direction * step);
    setPrice(newVal.toFixed(2));
  };

  // Switch to Manual Mode on adjustment
  const handleVolumeAdjust = (direction: 1 | -1) => {
    let base = 0;
    if (volStrategy.type === 'MANUAL') {
      base = parseInt(volStrategy.value) || 0;
    }
    const newVal = Math.max(0, base + (direction * 100));
    setVolStrategy({ type: 'MANUAL', value: newVal.toString() });
  };

  // Set Ratio Mode
  const handleQuickVolume = (ratio: number) => {
    let label = "";
    if (ratio === 1) label = "全仓 (100%)";
    else if (ratio === 0.5) label = "半仓 (50%)";
    else if (ratio === 0.333) label = "1/3仓 (33%)";
    else if (ratio === 0.25) label = "1/4仓 (25%)";
    else if (ratio === 0.2) label = "1/5仓 (20%)";
    else if (ratio === 0.1) label = "1/10仓 (10%)";
    else label = `按比例 (${(ratio * 100).toFixed(0)}%)`;

    setVolStrategy({ type: 'RATIO', value: ratio, label });
    setAmountInWan('');
  };

  // Manual Input Change
  const handleVolumeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolStrategy({ type: 'MANUAL', value: e.target.value });
    setAmountInWan('');
  };

  // Calculate volume from amount (in wan yuan)
  const calculateVolumeFromAmount = (amountWan: number, priceVal: number): number => {
    if (!amountWan || !priceVal) return 0;
    return Math.floor((amountWan * 10000 / priceVal / 100)) * 100;
  };

  // Handle amount input change
  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmountInWan(val);
    const num = parseFloat(val) || 0;
    const p = parseFloat(price) || 0;

    if (num > 0 && p > 0) {
      const vol = calculateVolumeFromAmount(num, p);
      setVolStrategy({ type: 'AMOUNT', value: num, label: `${vol}股` });
    } else {
      setVolStrategy({ type: 'MANUAL', value: '' });
    }
  };

  // Quick amount buttons
  const handleQuickAmount = (amt: number) => {
    setAmountInWan(String(amt));
    const p = parseFloat(price) || 0;
    if (p > 0) {
      const vol = calculateVolumeFromAmount(amt, p);
      setVolStrategy({ type: 'AMOUNT', value: amt, label: `${vol}股` });
    }
  };

  const handlePricePreset = async (type: PriceMode) => {
    setPriceType(type);

    const detail = await window.electronAPI.getStockDetail(symbol);
    const detailData = detail ? { upLimit: detail.upLimit, downLimit: detail.downLimit } : null;

    if (currentTick) {
      const p = calculateAutoPrice(type, currentTick, tradeSide, detailData);
      if (p) setPrice(p);
    } else {
      const p = calculateAutoPrice(type, { lastPrice: parseFloat(price) || 0, asks: [], bids: [], volume: 0, time: '', symbol: '' }, tradeSide, detailData);
      if (p) setPrice(p);
    }
  };

  // Handle Static Limit Price Click (Limit Up/Down)
  const handleLimitPriceFill = (limitPrice: number) => {
    if (limitPrice && limitPrice > 0) {
      setPrice(limitPrice.toFixed(2));
      setPriceType('LIMIT'); // Set to Manual Mode (White Background), not dynamic
    }
  };

  const handleSubmitOrder = async (action: 'BUY' | 'SELL') => {
    if (selectedAccountIds.length === 0) {
      setErrorMessage("请至少选择一个账户");
      return;
    }

    // 验证股票代码格式
    const code = symbol.split('.')[0];
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage("股票代码格式不正确");
      return;
    }

    // 解析价格
    const p = parseFloat(price) || currentPrice;
    if (!p || p <= 0) {
      setErrorMessage("价格必须为正数");
      return;
    }

    // 检查涨跌停限制
    const detail = await window.electronAPI.getStockDetail(symbol);
    if (detail) {
      if (action === 'BUY' && p > detail.upLimit) {
        setErrorMessage(`买入价 ${p.toFixed(2)} 超过涨停价 ${detail.upLimit.toFixed(2)}`);
        return;
      }
      if (action === 'SELL' && p < detail.downLimit) {
        setErrorMessage(`卖出价 ${p.toFixed(2)} 低于跌停价 ${detail.downLimit.toFixed(2)}`);
        return;
      }
    }

    // 计算每个账户的下单参数
    const accountOrders = selectedAccountIds.map(accId => {
      let finalVolume = 0;

      if (volStrategy.type === 'AMOUNT') {
        finalVolume = calculateVolumeFromAmount(volStrategy.value, p);
      } else if (volStrategy.type === 'MANUAL') {
        finalVolume = parseInt(volStrategy.value) || 0;
      } else {
        const ratio = volStrategy.value;

        if (action === 'BUY') {
          const accData = MOCK_MULTI_ACCOUNTS.find(a => a.id === accId);
          if (accData && p > 0) {
            const targetCash = accData.cash * ratio;
            finalVolume = Math.floor((targetCash / p) / 100) * 100;
          }
        } else {
          const pos = positions.find(po => po.accountId === accId && po.symbol === symbol);
          if (pos) {
            finalVolume = Math.floor((pos.canUseVolume * ratio) / 100) * 100;
          }
        }
      }

      return {
        id: accId,
        volume: finalVolume,
        amount: finalVolume * p
      };
    });

    // 检查是否有账户数量为0
    const zeroVolumeAccounts = accountOrders.filter(a => a.volume <= 0);
    if (zeroVolumeAccounts.length > 0) {
      setErrorMessage(`以下账户数量为0：\n${zeroVolumeAccounts.map(a => `账户[${a.id}]`).join('\n')}`);
      return;
    }

    // 显示确认面板
    setConfirmOrderInfo({
      accounts: accountOrders,
      symbol,
      action,
      price: p
    });
    setShowConfirmModal(true);
  };

  // 确认后执行下单
  const handleConfirmSubmit = async () => {
    if (!confirmOrderInfo) return;
    
    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      const results: { id: string; success: boolean; msg: string }[] = [];

      const promises = confirmOrderInfo.accounts.map(async (acc) => {
        const order: OrderRequest = {
          account_id: acc.id,
          symbol: confirmOrderInfo.symbol,
          order_type: confirmOrderInfo.action === 'BUY' ? 'buy' : 'sell',
          price_type: 'limit',
          price: confirmOrderInfo.price,
          volume: acc.volume,
          strategy_name: 'QMT_PRO_MANUAL',
          remark: 'Manual Order'
        };

        const res = await window.electronAPI.sendOrder(order);

        console.log("sendOrder:", res);

        if (res && res.success) {
          results.push({ id: acc.id, success: true, msg: `${acc.volume}股` });
        } else {
          results.push({ id: acc.id, success: false, msg: res?.error || '发送失败' });
        }
      });

      await Promise.all(promises);

      // 统一弹窗显示结果
      const successList = results.filter(r => r.success);
      const failList = results.filter(r => !r.success);

      if (successList.length > 0) {
        const msg = `已发送 ${successList.length} 个账户：\n${successList.map(r => `账户[${r.id}]: ${r.msg}`).join('\n')}`;
        setSuccessMessage(msg);
      }

      if (failList.length > 0) {
        const msg = `发送失败 ${failList.length} 个账户：\n${failList.map(r => `账户[${r.id}]: ${r.msg}`).join('\n')}`;
        setErrorMessage(msg);
      }

    } catch (e: any) {
      setErrorMessage(`下单异常: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleOrderSelection = (id: string) => {
    setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAllOrders = () => {
    const displayed = showCancellableOnly
      ? orders.filter(o => ['UNREPORTED', 'WAIT_REPORTING', 'REPORTED', 'SUBMITTED', 'PART_SUCC', 'UNKNOWN'].includes(o.status))
      : orders;
    const allIds = displayed.map(o => getOrderUniqueKey(o));
    if (selectedOrderIds.length === allIds.length && allIds.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(allIds);
    }
  };

  const handleCancelSelectedOrders = async () => {
    if (selectedOrderIds.length === 0) {
      setErrorMessage("未选中任何委托");
      return;
    }

    const results: { id: string; success: boolean; msg: string }[] = [];

    const promises = selectedOrderIds.map(async (id) => {
      const order = orders.find(o => getOrderUniqueKey(o) === id);
      if (order) {
        const accId = order.accountId || (selectedAccountIds.length > 0 ? selectedAccountIds[0] : '888001');
        const code = order.symbol.split('.')[0];
        const marketType = code.startsWith('6') ? 'sh' : 'sz';
        const res = await window.electronAPI.cancelOrder(accId, order.orderSysId, marketType);

        console.log("cancelOrder:", res);

        if (res && res.success) {
          results.push({ id, success: true, msg: '已发送' });
        } else {
          results.push({ id, success: false, msg: res?.error || '发送失败' });
        }
      } else {
        results.push({ id, success: false, msg: '委托不存在' });
      }
    });

    await Promise.all(promises);
    setSelectedOrderIds([]);

    // 统一弹窗显示结果
    const successList = results.filter(r => r.success);
    const failList = results.filter(r => !r.success);

    if (successList.length > 0) {
      const msg = `已发送 ${successList.length} 个撤单请求：\n${successList.map(r => `订单[${r.id}]`).join('\n')}`;
      setSuccessMessage(msg);
    }

    if (failList.length > 0) {
      const msg = `撤单失败 ${failList.length} 个：\n${failList.map(r => `订单[${r.id}]: ${r.msg}`).join('\n')}`;
      setErrorMessage(msg);
    }
  };

  // Sorting
  const handleSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortData = <T extends any>(data: T[]): T[] => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      // @ts-ignore
      const valA = a[sortConfig.key];
      // @ts-ignore
      const valB = b[sortConfig.key];

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const currentTick = priceMap[symbol] || null;
  const currentPrice = currentTick?.lastPrice || 0;

  // Calculate Change
  const preClose = currentTick?.preClose || currentPrice; // Fallback
  const change = currentPrice - preClose;
  const changePercent = preClose > 0 ? (change / preClose) * 100 : 0;

  // Use API Data for Limits if available, else fallback to calculation (though requirement says API provided)
  const apiLimitUp = currentTick?.limitUp || (preClose * 1.1);
  const apiLimitDown = currentTick?.limitDown || (preClose * 0.9);

  const displayLimitUp = apiLimitUp.toFixed(2);
  const displayLimitDown = apiLimitDown.toFixed(2);

  // Formatting helpers
  const formatBigNum = (val?: number) => {
    if (!val) return '--';
    if (val > 100000000) return (val / 100000000).toFixed(2) + '亿';
    if (val > 10000) return (val / 10000).toFixed(2) + '万';
    return val.toString();
  };

  const getPriceColor = (val: number, ref: number) => {
    if (val > ref) return 'text-red-600';
    if (val < ref) return 'text-green-600';
    return 'text-gray-900';
  };

  // ----------------------------------------------------------------
  // RENDER HELPERS
  // ----------------------------------------------------------------

  const renderSortHeader = (label: string, sortKey: string, align: 'left' | 'right' | 'center' = 'left', className: string = '') => (
    <div
      className={`${className} cursor-pointer hover:text-blue-600 transition-colors flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}
      onClick={() => handleSort(sortKey)}
    >
      {label}
      {sortConfig?.key === sortKey && (
        <span className="ml-1 text-[9px] opacity-70">
          {sortConfig.direction === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </div>
  );

  const sortTradesStable = (list: Trade[]): Trade[] => {
    return [...list].sort((a, b) => {
      if (b.tradeTimestamp !== a.tradeTimestamp) {
        return b.tradeTimestamp - a.tradeTimestamp;
      }
      return b.tradeId.localeCompare(a.tradeId);
    });
  };

  const renderPositionSortIndicator = (key: string) => {
    if (sortConfig?.key !== key) return null;
    return <span className="ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  const handlePositionSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  };

  const renderOrderBook = () => {
    if (!currentTick) return <div className={`flex-1 flex items-center justify-center text-xs ${colors.textMuted}`}>等待行情...</div>;

    const asks = currentTick.asks || [];
    const bids = currentTick.bids || [];
    const reversedAsks = asks.length > 0 ? [...asks].slice(0, 5).reverse() : [];
    const visibleBids = bids.length > 0 ? [...bids].slice(0, 5) : [];
    const maxVol = asks.length > 0 || bids.length > 0 ? Math.max(...asks.map(a => a[1]), ...bids.map(b => b[1]), 1) : 1;

    const formatPrice = (price: number) => price > 0 ? price.toFixed(2) : '--';
    const formatVol = (vol: number) => vol > 0 ? vol : '--';

    return (
      <div className="flex flex-col h-full font-mono text-xs select-none">
        {/* ASKS (Sell - Blue) */}
        <div className="flex-1 flex flex-col justify-end mb-2 space-y-0.5">
          {reversedAsks.length > 0 ? reversedAsks.map((ask, i) => {
            const level = 5 - i;
            const width = Math.min((ask[1] / maxVol) * 100, 100);
            return (
              <div
                key={`ask-${level}`}
                className={`relative flex justify-between px-2 py-1.5 cursor-pointer rounded-sm overflow-hidden transition-all duration-75 active:scale-95 ${colors.hoverHighlight}`}
                onClick={() => { setPriceType('LIMIT'); setPrice(ask[0].toFixed(2)); }}
              >
                <div className="absolute top-0 bottom-0 right-0 bg-blue-500/10" style={{ width: `${width}%` }} />
                <span className={`relative z-10 w-8 ${colors.textMuted} opacity-70`}>卖 {level}</span>
                <span className="relative z-10 text-blue-600 font-medium">{formatPrice(ask[0])}</span>
                <span className={`relative z-10 w-12 text-right ${colors.textMuted}`}>{formatVol(ask[1])}</span>
              </div>
            );
          }) : (
            <div className="flex justify-between px-2 py-1.5 text-gray-400">
              <span>卖 --</span>
              <span>--</span>
              <span>--</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className={`h-px w-full my-1 bg-gray-300`}></div>

        {/* BIDS (Buy - Red) */}
        <div className="flex-1 flex flex-col justify-start mt-1 space-y-0.5">
          {visibleBids.length > 0 ? visibleBids.map((bid, i) => {
            const level = i + 1;
            const width = Math.min((bid[1] / maxVol) * 100, 100);
            return (
              <div
                key={`bid-${level}`}
                className={`relative flex justify-between px-2 py-1.5 cursor-pointer rounded-sm overflow-hidden transition-all duration-75 active:scale-95 ${colors.hoverHighlight}`}
                onClick={() => { setPriceType('LIMIT'); setPrice(bid[0].toFixed(2)); }}
              >
                <div className="absolute top-0 bottom-0 right-0 bg-red-500/10" style={{ width: `${width}%` }} />
                <span className={`relative z-10 w-8 ${colors.textMuted} opacity-70`}>买 {level}</span>
                <span className="relative z-10 text-red-600 font-medium">{formatPrice(bid[0])}</span>
                <span className={`relative z-10 w-12 text-right ${colors.textMuted}`}>{formatVol(bid[1])}</span>
              </div>
            );
          }) : (
            <div className="flex justify-between px-2 py-1.5 text-gray-400">
              <span>买 --</span>
              <span>--</span>
              <span>--</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAccountSelector = () => (
    <div className={`w-[220px] flex flex-col rounded-3xl overflow-hidden shadow-sm ${colors.card} flex-shrink-0`}>
      <div className="bg-gray-50 border-b border-gray-200 p-3 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">多账户选择</span>
        <button
          onClick={() => {
            if (selectedAccountIds.length === multiAccounts.length) setSelectedAccountIds([]);
            else setSelectedAccountIds(multiAccounts.map(a => a.account_id));
          }}
          className="text-xs text-blue-600 font-bold hover:text-blue-700"
        >
          {selectedAccountIds.length === multiAccounts.length ? '全不选' : '全选'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {multiAccounts.length === 0 && (
          <div className="py-8 px-4 text-center text-xs text-gray-400 italic">等待账户加载...</div>
        )}
        {multiAccounts.map(acc => {
          const isSelected = selectedAccountIds.includes(acc.account_id);
          const isLogin = acc.login_status === 0; // Assuming 0 is logged in/normal per snippet

          // Dynamic Content Logic
          let dynamicValue = '';
          let dynamicLabel = '';
          let dynamicColor = '';

          if (tradeSide === 'BUY') {
            const accInfo = assetsMap[acc.account_id];
            dynamicValue = accInfo ? `¥${accInfo.cash.toLocaleString()}` : '--';
            dynamicLabel = '可买';
            dynamicColor = 'text-red-600';
          } else {
            const pos = positions.find(p => p.accountId === acc.account_id && p.symbol === symbol);
            const vol = pos ? pos.canUseVolume : 0;
            dynamicValue = `${vol}股`;
            dynamicLabel = '可卖';
            dynamicColor = vol > 0 ? 'text-blue-600' : 'text-gray-300';
          }

          return (
            <div
              key={acc.account_id}
              onClick={() => {
                setSelectedAccountIds(prev =>
                  prev.includes(acc.account_id) ? prev.filter(id => id !== acc.account_id) : [...prev, acc.account_id]
                );
              }}
              className={`p-2 rounded-xl cursor-pointer border transition-all flex items-center gap-2 group ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:bg-gray-50'}`}
            >
              <div className={`w-4 h-4 rounded border flex flex-shrink-0 items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>账户 {acc.account_id.slice(-4)}</span>
                  <span className={`text-[10px] scale-90 origin-right font-bold ${isLogin ? 'text-green-500' : 'text-gray-400'}`}>
                    {isLogin ? '在线' : '离线'}
                  </span>
                </div>

                <div className="flex justify-between items-baseline mt-0.5">
                  <span className="text-[10px] text-gray-400 font-mono">{acc.account_id}</span>
                  <span className={`text-xs font-mono font-bold ${dynamicColor}`}>{dynamicValue}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );

  const renderAssetsPanel = () => {
    // Calculate Summary across all accounts
    const totalAssets = Object.values(assetsMap).reduce((sum, acc) => sum + acc.assets, 0);
    const totalMarketValue = Object.values(assetsMap).reduce((sum, acc) => sum + acc.marketValue, 0);
    const totalCash = Object.values(assetsMap).reduce((sum, acc) => sum + acc.cash, 0);

    return (
      <div className="p-8 h-full overflow-y-auto pt-12">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
          <span className="bg-blue-600 w-1.5 h-6 mr-3 rounded-full"></span>
          资金账户总览 (汇总)
        </h2>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className={`p-6 rounded-2xl ${colors.card} bg-gradient-to-br from-white to-gray-50 border border-gray-100 shadow-sm`}>
            <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">总资产</div>
            <div className="text-4xl font-mono font-bold text-gray-900">
              {totalAssets > 0 ? totalAssets.toLocaleString() : '---'}
              <span className="text-sm font-normal text-gray-400 ml-1">CNY</span>
            </div>
          </div>
          <div className={`p-6 rounded-2xl ${colors.card} bg-gradient-to-br from-white to-gray-50 border border-gray-100 shadow-sm`}>
            <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">持仓市值</div>
            <div className="text-4xl font-mono font-bold text-blue-600">
              {totalMarketValue > 0 ? totalMarketValue.toLocaleString() : '---'}
            </div>
          </div>
          <div className={`p-6 rounded-2xl ${colors.card} bg-gradient-to-br from-white to-gray-50 border border-gray-100 shadow-sm`}>
            <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">可用资金</div>
            <div className="text-4xl font-mono font-bold text-green-600">
              {totalCash > 0 ? totalCash.toLocaleString() : '---'}
            </div>
          </div>
        </div>

        {/* Dynamic Account List */}
        <div className={`rounded-xl overflow-hidden border ${colors.border} ${colors.card} shadow-sm`}>
          <div className={`px-6 py-4 border-b ${colors.border} flex justify-between items-center bg-gray-50`}>
            <span className="font-bold text-gray-700">账户明细</span>
            <span className="text-xs font-mono text-gray-400">共 {multiAccounts.length} 个账户</span>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-white text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">账号 ID</th>
                <th className="px-6 py-3">账户类型</th>
                <th className="px-6 py-3 text-right">总资产</th>
                <th className="px-6 py-3 text-right">可用资金</th>
                <th className="px-6 py-3 text-center">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {multiAccounts.length > 0 ? (
                multiAccounts.map(acc => {
                  const info = assetsMap[acc.account_id];
                  const isLogin = acc.login_status === 0;
                  return (
                    <tr key={acc.account_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-gray-800">{acc.account_id}</td>
                      <td className="px-6 py-4 text-gray-500">{acc.account_type === 2 ? '股票实盘' : '普通账户'}</td>
                      <td className="px-6 py-4 text-right font-mono">
                        {(info?.assets ?? 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-green-600">
                        {(info?.cash ?? 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${isLogin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {isLogin ? '已连接' : '未登录'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm italic">
                    等待账户信息下发...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPositionsTableContent = () => {
    // 根据 sortConfig 排序
    const sortedPositions = [...positions].sort((a, b) => {
      // 默认按 accountId + symbol 排序
      if (!sortConfig) {
        if (a.accountId !== b.accountId) return a.accountId.localeCompare(b.accountId);
        return a.symbol.localeCompare(b.symbol);
      }

      let result = 0;

      // 可用排序
      if (sortConfig.key === 'canUseVolume') {
        result = sortConfig.direction === 'asc'
          ? a.canUseVolume - b.canUseVolume
          : b.canUseVolume - a.canUseVolume;
      }
      // 市值排序
      else if (sortConfig.key === 'marketValue') {
        result = sortConfig.direction === 'asc'
          ? a.marketValue - b.marketValue
          : b.marketValue - a.marketValue;
      }
      // 盈亏排序
      else if (sortConfig.key === 'profit') {
        const curPriceA = priceMap[a.symbol]?.lastPrice ?? a.openPrice ?? 0;
        const curPriceB = priceMap[b.symbol]?.lastPrice ?? b.openPrice ?? 0;
        const profitA = (curPriceA - (a.openPrice ?? 0)) * a.volume;
        const profitB = (curPriceB - (b.openPrice ?? 0)) * b.volume;
        result = sortConfig.direction === 'asc' ? profitA - profitB : profitB - profitA;
      }

      // 如果主键相等，使用 accountId + symbol 作为 tiebreaker 确保稳定排序
      if (result === 0) {
        const keyA = a.accountId + a.symbol;
        const keyB = b.accountId + b.symbol;
        return keyA.localeCompare(keyB);
      }

      return result;
    });

    return (
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">账户</th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">代码/名称</th>
              <th
                className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handlePositionSort('canUseVolume')}
              >
                持仓/可用 {renderPositionSortIndicator('canUseVolume')}
              </th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">现价/成本</th>
              <th
                className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handlePositionSort('marketValue')}
              >
                市值 {renderPositionSortIndicator('marketValue')}
              </th>
              <th
                className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handlePositionSort('profit')}
              >
                盈亏 {renderPositionSortIndicator('profit')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedPositions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">暂无持仓数据</td>
              </tr>
            ) : (
              sortedPositions.map((pos) => {
                // 从 priceMap 获取实时价格，如果没有则使用成本价
                const curPrice = priceMap[pos.symbol]?.lastPrice ?? pos.openPrice ?? 0;
                const profit = (curPrice - (pos.openPrice ?? 0)) * pos.volume;
                const profitPercent = (pos.openPrice ?? 0) > 0 ? (profit / ((pos.openPrice ?? 0) * pos.volume)) * 100 : 0;

                return (
                  <tr key={`${pos.accountId}-${pos.symbol}`} className="hover:bg-blue-50 transition-colors cursor-pointer group" onClick={async () => {
                    let val = pos.symbol;
                    if (!val.includes('.')) {
                      if (val.startsWith('6') || val.startsWith('9')) val += '.SH';
                      else if (val.startsWith('0') || val.startsWith('3')) val += '.SZ';
                      else if (val.startsWith('8') || val.startsWith('4')) val += '.BJ';
                    }
                    setSymbol(val);
                    setTradeSide('SELL');
                    window.electronAPI.setFocusSymbol(val);
                    const detail = await window.electronAPI.getStockDetail(val);
                    if (detail) {
                      setStockName(detail.name);
                    }
                  }}>
                    <td className="px-6 py-3">
                      <div className="text-xs font-bold text-gray-500">{pos.accountId}</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="text-sm font-bold text-gray-900">{pos.stockName}</div>
                      <div className="text-xs font-mono text-gray-400">{pos.symbol}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="text-sm font-bold text-gray-900">{pos.volume}</div>
                      <div className="text-xs font-bold text-blue-600">可卖 {pos.canUseVolume}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className={`text-sm font-mono font-bold ${curPrice > (pos.openPrice ?? 0) ? 'text-red-600' : curPrice < (pos.openPrice ?? 0) ? 'text-green-600' : 'text-gray-900'}`}>{curPrice.toFixed(2)}</div>
                      <div className="text-xs font-mono text-gray-400">{(pos.openPrice ?? 0).toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="text-sm font-mono font-bold text-gray-900">{pos.marketValue.toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className={`text-sm font-mono font-bold ${profit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {profit >= 0 ? '+' : ''}{profit.toLocaleString()}
                      </div>
                      <div className={`text-xs font-mono font-bold ${profit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {profit >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTableList = (columns: any[], data: any[], rowRenderer: any) => (
    <div className={`h-full w-full flex flex-col p-8 pt-12`}>
      <div className={`flex-1 flex flex-col rounded-2xl overflow-hidden shadow-sm ${colors.card}`}>
        {/* Header */}
        <div className={`flex-shrink-0 flex border-b ${colors.border} bg-gray-50`}>
          {columns.map((col: any, i: number) => (
            <div key={i} className={`${col.className} px-6 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider`}>
              {col.sortKey ? renderSortHeader(col.label, col.sortKey, col.align, '') : <div className={`flex w-full ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>{col.label}</div>}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-white">
          {data.map((item: any, i: number) => (
            <div key={i} className={`flex border-b last:border-b-0 border-gray-300 ${colors.rowHover} transition-colors group`}>
              {rowRenderer(item, i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="h-full w-full flex flex-col p-8 pt-12">
      {/* Action Bar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <button
            onClick={handleSelectAllOrders}
            className="px-4 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            全选
          </button>
        </div>

        {/* Cancellable Filter */}
        <label className="flex items-center space-x-2 text-xs font-bold text-gray-600 bg-white px-3 py-1.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors select-none">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            checked={showCancellableOnly}
            onChange={(e) => setShowCancellableOnly(e.target.checked)}
          />
          <span>仅显示可撤</span>
        </label>

        <button
          onClick={handleCancelSelectedOrders}
          disabled={selectedOrderIds.length === 0}
          className={`flex items-center gap-2 px-6 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all ${selectedOrderIds.length > 0
            ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200 active:scale-95'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
          选中撤单 ({selectedOrderIds.length})
        </button>

        <div className="flex-1" />
        <span className="text-xs text-gray-400 font-medium">共 {orders.length} 笔委托</span>
      </div>

        <div className={`flex-1 flex flex-col rounded-2xl overflow-hidden shadow-sm ${colors.card}`}>
        {/* Header */}
        <div className={`flex-shrink-0 flex border-b ${colors.border} bg-gray-50`}>
          <div className="w-12 px-6 py-2"></div>
          {[
            { label: "时间", sortKey: "orderTime", className: "w-32" },
            { label: "账户", sortKey: "accountId", className: "w-32" },
            { label: "订单号", sortKey: "orderId", className: "w-40" },
            { label: "合同号", sortKey: "orderSysId", className: "w-40" },
            { label: "代码", sortKey: "symbol", className: "w-28" },
            { label: "名称", className: "w-28" },
            { label: "方向", sortKey: "action", className: "w-20", align: "center" },
            { label: "价格", sortKey: "price", align: "right", className: "w-24" },
            { label: "数量", sortKey: "volume", align: "right", className: "w-28" },
            { label: "状态", sortKey: "status", align: "center", className: "w-24" },
            { label: "说明", className: "flex-1" },
          ].map((col: any, i: number) => (
            <div key={i} className={`${col.className} px-6 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider`}>
              {col.sortKey ? renderSortHeader(col.label, col.sortKey, col.align, '') : <div className={`flex w-full ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>{col.label}</div>}
            </div>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {(() => {
            const displayed = showCancellableOnly
              ? orders.filter(o => ['UNREPORTED', 'WAIT_REPORTING', 'REPORTED', 'SUBMITTED', 'PART_SUCC', 'UNKNOWN'].includes(o.status))
              : orders;
            const sorted = sortData(displayed);

            if (sorted.length === 0) {
              return (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 opacity-50">
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-medium">暂无委托数据</span>
                </div>
              );
            }

            return sorted.map((o: OrderStatus) => {
              const uniqueKey = getOrderUniqueKey(o);
              const isSelected = selectedOrderIds.includes(uniqueKey);
              const cell = (content: React.ReactNode, width: string, align: 'left' | 'center' | 'right' = 'left') => (
                <div className={`${width} px-6 py-2 text-sm flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
                  {content}
                </div>
              );
              return (
                <div
                  key={uniqueKey}
                  className={`flex border-b last:border-b-0 border-gray-100 hover:bg-blue-50/50 transition-colors group ${isSelected ? 'bg-blue-50/80' : ''}`}
                  onClick={() => {
                    setSelectedOrderIds(prev =>
                      prev.includes(uniqueKey) ? prev.filter(id => id !== uniqueKey) : [...prev, uniqueKey]
                    );
                  }}
                >
                  <div className="w-12 px-6 py-2 flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                      checked={isSelected}
                      onChange={() => { }}
                    />
                  </div>
                  {cell(<div className="text-xs font-mono text-gray-400">{o.orderTime?.split(' ')[1] || o.orderTime || '--'}</div>, "w-32")}
                  {cell(<div className="font-bold text-gray-400 text-xs">{o.accountId}</div>, "w-32")}
                  {cell(<div className="font-mono text-gray-600 text-xs">{o.orderId}</div>, "w-40")}
                  {cell(<div className="font-mono text-gray-500 text-xs">{o.orderSysId}</div>, "w-40")}
                  {cell(<div className="font-mono font-bold text-gray-800">{o.symbol}</div>, "w-28")}
                  {cell(<div className="font-medium text-gray-700 truncate">{o.stockName}</div>, "w-28")}
                  {cell(<div className={`font-bold text-xs px-2 py-1 rounded ${o.action === 'BUY' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{o.action === 'BUY' ? '买入' : '卖出'}</div>, "w-24", "center")}
                  {cell(<div className="font-mono text-gray-600">{o.price.toFixed(2)}</div>, "w-24", "right")}
                  {cell(<div className="font-mono text-gray-600">{o.filledVolume}/{o.volume}</div>, "w-28", "right")}
                  {cell(<span className={`px-2 py-1 rounded text-[10px] font-bold 
                    ${(o.status === 'FILLED' || o.status === 'PART_SUCC') ? 'bg-green-100 text-green-700' :
                      (o.status === 'CANCELED' || o.status === 'PART_CANCEL' || o.status === 'PARTSUCC_CANCEL' || o.status === 'REPORTED_CANCEL') ? 'bg-yellow-100 text-yellow-700' :
                        (o.status === 'JUNK' || o.status === 'REJECTED') ? 'bg-red-100 text-red-700' :
                          'bg-blue-50 text-blue-600'
                    }`}>{o.status}</span>, "w-24", "center")}
              {cell(<div className="text-xs text-gray-400 truncate">{o.msg}</div>, "flex-1")}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* 撤单成功弹窗 */}
      {successMessage && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] transform scale-100 transition-all border border-gray-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">操作成功</h3>
              <p className="text-sm text-gray-500 mb-6 whitespace-pre-line">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 撤单失败弹窗 */}
      {errorMessage && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] transform scale-100 transition-all border border-gray-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">操作失败</h3>
              <p className="text-sm text-gray-500 mb-6 whitespace-pre-line">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage(null)}
                className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTrades = () => renderTableList(
    [
      { label: "时间", className: "w-32" },
      { label: "代码", className: "w-32" },
      { label: "名称", className: "w-32" },
      { label: "方向", className: "w-24", align: "center" },
      { label: "价格", align: "right", className: "w-32" },
      { label: "数量", align: "right", className: "w-32" },
      { label: "金额", align: "right", className: "flex-1" },
    ],
    sortTradesStable(trades),
    (t: Trade, i: number) => {
      const cell = (content: React.ReactNode, width: string, align: 'left' | 'center' | 'right' = 'left') => (
        <div className={`${width} px-6 py-2 text-sm flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          {content}
        </div>
      );
      return (
        <React.Fragment>
          {cell(<div className="text-xs font-mono text-gray-400">{t.tradeTime}</div>, "w-32")}
          {cell(<div className="font-mono font-bold text-gray-800">{t.symbol}</div>, "w-32")}
          {cell(<div className="font-medium text-gray-700">{t.stockName}</div>, "w-32")}
          {cell(<div className={`font-bold text-xs px-2 py-1 rounded ${t.action === 'BUY' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{t.action === 'BUY' ? '买入' : '卖出'}</div>, "w-24", "center")}
          {cell(<div className="font-mono text-gray-600">{t.price.toFixed(2)}</div>, "w-32", "right")}
          {cell(<div className="font-mono text-gray-600">{t.volume}</div>, "w-32", "right")}
          {cell(<div className="font-mono font-bold text-gray-800">{t.amount.toLocaleString()}</div>, "flex-1", "right")}
        </React.Fragment>
      )
    }
  );

  const renderLogs = () => (
    <div className={`h-full w-full flex flex-col ${colors.contentBg} pt-12`}>
      <div className="h-full flex flex-col p-6">
        <div className={`flex-1 rounded-3xl p-6 overflow-hidden shadow-sm ${colors.card} flex flex-col`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-700">系统日志</h3>
            <button onClick={() => setLogs([])} className="text-xs text-blue-600 hover:underline">清除日志</button>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 text-gray-600">
            {logs.map((log, i) => (
              <div key={i} className="break-all border-b border-gray-100 py-1 last:border-0">
                <span className="text-blue-500 mr-2">●</span>{log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTradePanel = () => (
    <div className="flex flex-col h-full w-full p-6 gap-6 pt-12"> {/* Increased top padding for window controls */}

      {/* TOP ROW: Accounts | Trade Form | Order Book | Chart */}
      {/* Increased height to 420px to provide more vertical room */}
      <div className="flex w-full gap-5 h-[420px] shrink-0">

        {/* 0. Multi-Account Selector */}
        {renderAccountSelector()}

        {/* 1. Trade Form */}
        <div className={`w-[280px] flex flex-col rounded-3xl overflow-hidden shadow-sm transition-all ${colors.card}`}>

          {/* Tabs */}
          <div className="flex p-1.5 gap-1.5 bg-gray-100 border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setTradeSide('BUY')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold tracking-wide transition-all ${tradeSide === 'BUY' ? 'bg-white text-red-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
            >
              买入
            </button>
            <button
              onClick={() => setTradeSide('SELL')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold tracking-wide transition-all ${tradeSide === 'SELL' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
            >
              卖出
            </button>
          </div>

          {/* FORM CONTENT */}
          <div className="p-4 flex flex-col h-full gap-2">

            {/* Symbol Input */}
            <div className="relative group">
              <input
                type="text"
                value={symbol}
                onChange={handleSymbolChange}
                spellCheck="false"
                autoComplete="off"
                className={`w-full py-1.5 px-4 rounded-xl border-2 outline-none font-mono text-lg font-bold uppercase tracking-wide transition-all ${colors.input}`}
                placeholder="股票代码"
              />
              <div className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none`}>{stockName || '---'}</div>
            </div>

            {/* Price Section */}
            <div className="space-y-1">
              {/* Price Mode Selector (Segmented Control) */}
              <div className="flex bg-gray-100 p-1 rounded-lg">
                {[
                  { id: 'BEST_5', label: '五档' },
                  { id: 'OPPOSITE', label: '对价' },
                  { id: 'CAGE', label: '笼子' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handlePricePreset(type.id as PriceMode)}
                    className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${priceType === type.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {/* Price Input Wrapper */}
              <div className="relative">
                <button
                  onClick={() => handlePriceAdjust(-1)}
                  className={`absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-l-xl transition-colors`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <input
                  type="number"
                  value={price}
                  onChange={e => { setPrice(e.target.value); setPriceType('LIMIT'); }} // Auto switch to manual
                  placeholder={currentPrice.toFixed(2)}
                  spellCheck="false"
                  autoComplete="off"
                  className={`w-full py-1.5 pl-8 pr-8 rounded-xl border-2 outline-none font-mono text-lg font-bold text-center transition-all ${priceType !== 'LIMIT' ? 'border-blue-400 bg-blue-50 text-blue-700' : colors.input} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                />
                <button
                  onClick={() => handlePriceAdjust(1)}
                  className={`absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-r-xl transition-colors`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>

              {/* Limit Labels - Bigger Font */}
              <div className="flex justify-between px-1">
                <span
                  className="text-xs font-mono font-bold text-green-600 cursor-pointer hover:bg-green-50 px-1 rounded"
                  onClick={() => handleLimitPriceFill(apiLimitDown)}
                >
                  跌停 {displayLimitDown}
                </span>
                <span
                  className="text-xs font-mono font-bold text-red-600 cursor-pointer hover:bg-red-50 px-1 rounded"
                  onClick={() => handleLimitPriceFill(apiLimitUp)}
                >
                  涨停 {displayLimitUp}
                </span>
              </div>
            </div>

            {/* Volume Section */}
            <div className="space-y-1">
              <div className="relative">
                <button
                  onClick={() => handleVolumeAdjust(-1)}
                  className={`absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-l-xl transition-colors`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>

                {/* Intelligent Volume Input */}
                <input
                  type="text"
                  value={volStrategy.type === 'RATIO' || volStrategy.type === 'AMOUNT' ? volStrategy.label : volStrategy.value}
                  onChange={handleVolumeInputChange}
                  spellCheck="false"
                  autoComplete="off"
                  onClick={() => {
                    if (volStrategy.type === 'RATIO' || volStrategy.type === 'AMOUNT') {
                      setVolStrategy({ type: 'MANUAL', value: '' });
                      setAmountInWan('');
                    }
                  }}
                  className={`w-full py-1.5 pl-8 pr-8 rounded-xl border-2 outline-none font-mono text-lg font-bold text-center transition-all ${volStrategy.type === 'RATIO' || volStrategy.type === 'AMOUNT' ? 'border-purple-400 bg-purple-50 text-purple-700' : colors.input} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                />

                <button
                  onClick={() => handleVolumeAdjust(1)}
                  className={`absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-r-xl transition-colors`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>

              {/* Quick Percentage Presets */}
              <div className="grid grid-cols-4 gap-2">
                {tradeSide === 'BUY' ? (
                  <>
                    <button onClick={() => handleQuickVolume(0.1)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/10</button>
                    <button onClick={() => handleQuickVolume(0.2)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/5</button>
                    <button onClick={() => handleQuickVolume(0.25)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/4</button>
                    <button onClick={() => handleQuickVolume(0.333)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/3</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleQuickVolume(0.25)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/4</button>
                    <button onClick={() => handleQuickVolume(0.333)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/3</button>
                    <button onClick={() => handleQuickVolume(0.5)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">1/2</button>
                    <button onClick={() => handleQuickVolume(1)} className="py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">全仓</button>
                  </>
                )}
              </div>
              {/* REMOVED AVAILABLE DISPLAY TEXT HERE */}
            </div>

            {/* Amount Input Section */}
            {tradeSide === 'BUY' && (
              <div className="space-y-0 border-t border-dashed border-gray-200 pt-0.5">
                <div className="relative">
                  <input
                    type="number"
                    value={amountInWan}
                    onChange={handleAmountInputChange}
                    placeholder="金额"
                    className={`w-full py-1.5 pl-3 pr-6 rounded-xl border-2 outline-none font-mono text-lg font-bold text-center ${amountInWan ? 'border-purple-400 bg-purple-50 text-purple-700' : colors.input} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${amountInWan ? 'text-purple-500' : 'text-gray-400'}`}>万</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="">
              <button
                onClick={() => handleSubmitOrder(tradeSide)}
                disabled={isSubmitting || selectedAccountIds.length === 0}
                className={`w-full py-3 rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all text-white flex items-center justify-center space-x-2 ${tradeSide === 'BUY'
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                  } ${selectedAccountIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span>
                  {tradeSide === 'BUY' ? '买入' : '卖出'}
                  {selectedAccountIds.length > 1 && ` (${selectedAccountIds.length})`}
                </span>
                {isSubmitting && <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Order Book (Next to Trade Form) */}
        <div className={`w-[220px] flex flex-col rounded-3xl p-5 flex-shrink-0 shadow-sm ${colors.card}`}>
          <div className="flex justify-between items-center mb-2">
            <span className={`text-sm font-bold tracking-widest text-gray-400`}>五档盘口</span>
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 opacity-50"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 opacity-50"></div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            {renderOrderBook()}
          </div>
        </div>

        {/* 3. Stock Info & Chart (Right side, fills remaining) */}
        <div className={`flex-1 flex flex-col rounded-3xl p-6 ${colors.card} relative overflow-hidden shadow-sm`}>
          {/* Header Grid Layout - Matches User's Screenshot */}
          <div className="flex justify-between items-start mb-4 select-none">
            {/* Left: Huge Price */}
            <div className="flex flex-col mr-6">
              {/* Price - Removed tracking-tighter for cleaner look */}
              <div className={`text-6xl font-bold leading-none ${getPriceColor(currentPrice, preClose)}`}>
                {currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}
              </div>
              {/* Change Info */}
              <div className={`flex items-center space-x-4 mt-2 font-bold text-xl ${getPriceColor(currentPrice, preClose)}`}>
                <span>{change > 0 ? '+' : ''}{change.toFixed(2)}</span>
                <span>{change > 0 ? '+' : ''}{changePercent.toFixed(2)}%</span>
              </div>
            </div>

            {/* Right: 3x3 Grid Info - Removed global font-mono, applied selectively */}
            <div className="flex-1 grid grid-cols-3 gap-y-3 gap-x-8 text-sm mt-1">
              {/* Row 1 */}
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">最高</span><span className={`font-bold font-mono ${getPriceColor(currentTick?.high || 0, preClose)}`}>{currentTick?.high?.toFixed(2) || '--'}</span></div>
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">市值</span><span className="text-gray-800 font-bold font-mono">{formatBigNum(currentTick?.totalValue)}</span></div>
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">量比</span><span className="text-red-600 font-bold font-mono">{currentTick?.volRatio || '--'}</span></div>

              {/* Row 2 */}
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">最低</span><span className={`font-bold font-mono ${getPriceColor(currentTick?.low || 0, preClose)}`}>{currentTick?.low?.toFixed(2) || '--'}</span></div>
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">流通</span><span className="text-gray-800 font-bold font-mono">{formatBigNum(currentTick?.currencyValue)}</span></div>
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">换手</span><span className="text-gray-800 font-bold font-mono">{currentTick?.turnoverRate ? currentTick.turnoverRate + '%' : '--'}</span></div>

              {/* Row 3 */}
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">今开</span><span className={`font-bold font-mono ${getPriceColor(currentTick?.open || 0, preClose)}`}>{currentTick?.open?.toFixed(2) || '--'}</span></div>
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">市盈</span><span className="text-gray-800 font-bold font-mono">{currentTick?.pe || '--'}</span></div>
              <div className="flex justify-between items-center border-r border-gray-200 pr-2 last:border-0"><span className="text-gray-400 font-medium">成交额</span><span className="text-gray-800 font-bold font-mono">{formatBigNum(currentTick?.amount)}</span></div>
            </div>
          </div>

          {/* Chart Placeholder */}
          <div className={`flex-1 rounded-2xl border-2 border-dashed transition-all border-gray-300 bg-gray-50 flex items-center justify-center group cursor-crosshair`}>
            <div className="text-center opacity-30 group-hover:opacity-50 transition-opacity">
              <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-gray-500">K线图区域</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Positions Table */}
      <div className={`flex-1 flex flex-col rounded-3xl overflow-hidden shadow-sm ${colors.card} min-h-0`}>
        <div className={`px-6 py-4 border-b ${colors.border} bg-gray-50 flex justify-between items-center`}>
          <h3 className="font-bold text-gray-700">持仓列表</h3>
          {/* Removed 'View All' link as this is now the main view */}
        </div>
        <div className="flex-1 overflow-y-auto relative">
          {renderPositionsTableContent()}
        </div>

        {/* Error Modal */}
        {errorMessage && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] transform scale-100 transition-all border border-gray-200">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">操作失败</h3>
                <p className="text-sm text-gray-500 mb-6 whitespace-pre-line">{errorMessage}</p>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-colors"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {showConfirmModal && confirmOrderInfo && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px] transform scale-100 transition-all border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                确认下单 ({confirmOrderInfo.accounts.length} 个账户)
              </h3>

              {/* 账户表格 */}
              <div className="border rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">账户</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">数量</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {confirmOrderInfo.accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td className="px-3 py-2 font-mono text-gray-800">{acc.id}</td>
                        <td className="px-3 py-2 text-right font-mono">{acc.volume.toLocaleString()}股</td>
                        <td className="px-3 py-2 text-right font-mono">{acc.amount.toLocaleString()}元</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 股票信息 */}
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">股票</span>
                  <span className="font-mono">{confirmOrderInfo.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">方向</span>
                  <span className={confirmOrderInfo.action === 'BUY' ? 'text-red-600 font-bold' : 'text-blue-600 font-bold'}>
                    {confirmOrderInfo.action === 'BUY' ? '买入' : '卖出'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">价格</span>
                  <span className="font-mono">{confirmOrderInfo.price.toFixed(2)}元</span>
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting}
                  className={`flex-1 py-2 rounded-xl font-bold text-white ${
                    confirmOrderInfo.action === 'BUY' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                  } ${isSubmitting ? 'opacity-50' : ''}`}
                >
                  {isSubmitting ? '发送中...' : '确认下单'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {successMessage && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] transform scale-100 transition-all border border-gray-200">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">操作成功</h3>
                <p className="text-sm text-gray-500 mb-6 whitespace-pre-line">{successMessage}</p>
                <button
                  onClick={() => setSuccessMessage(null)}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-colors"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-row ${colors.appBg}`}>
      {/* -- START Custom CSS for Electron Drag & Selection -- */}
      <style>{`
          .app-drag-region {
            -webkit-app-region: drag;
          }
          .no-drag {
            -webkit-app-region: no-drag;
          }
          /* Custom Scrollbar override for whole app just in case */
          ::-webkit-scrollbar {
             width: 6px;
             height: 6px;
          }
          ::-webkit-scrollbar-thumb {
             background: rgba(156, 163, 175, 0.5); 
             border-radius: 3px;
          }
          /* Toast fade-in animation */
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 0.3s ease-out;
          }
        `}</style>

      {/* Navigation Sidebar */}
      <div
        className={`flex flex-col py-6 ${colors.sidebarBg} z-20 transition-all duration-300 ease-in-out relative ${isSidebarOpen ? 'w-56' : 'w-20 items-center'} app-drag-region`}
      >
        {/* Logo */}
        <div className={`flex items-center mb-8 px-4 ${isSidebarOpen ? 'justify-start space-x-3' : 'justify-center'} no-drag`}>
          <div className="w-10 h-10 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><Icons.Rocket /></svg>
          </div>
          {isSidebarOpen && (
            <div className="flex flex-col overflow-hidden whitespace-nowrap">
              <span className="font-black text-lg text-gray-800 tracking-tight leading-none">QMT <span className="text-blue-600">PRO</span></span>
              <span className="text-[10px] font-bold text-gray-400 tracking-wider">TERMINAL v2.0</span>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div className="flex-1 w-full space-y-2 px-3 no-drag">
          {[
            { id: 'assets', label: '资金账户', Icon: Icons.Assets },
            { id: 'trade', label: '交易下单', Icon: Icons.Trade },
            { id: 'orders', label: '委托查询', Icon: Icons.Orders },
            { id: 'trades', label: '成交查询', Icon: Icons.Trades },
          ].map(item => (
            <div
              key={item.id}
              onClick={() => setActiveTab(item.id as TabType)}
              className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 group whitespace-nowrap overflow-hidden
                            ${activeTab === item.id
                  ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }
                            ${!isSidebarOpen && 'justify-center'}
                        `}
              title={!isSidebarOpen ? item.label : ''}
            >
              <svg className={`flex-shrink-0 w-6 h-6 transition-transform group-hover:scale-110 ${activeTab === item.id ? 'stroke-2' : 'stroke-[1.5]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <item.Icon />
              </svg>

              <span className={`ml-3 font-bold text-sm transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Sidebar Toggle Button */}
        <div className="px-3 mt-auto no-drag">
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-all shadow-sm"
            title={isSidebarOpen ? "收起菜单" : "展开菜单"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isSidebarOpen ? <Icons.PanelCollapse /> : <Icons.PanelExpand />}
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col relative overflow-hidden ${colors.contentBg}`}>

        {/* Window Controls Header Overlay */}
        <div className="absolute top-0 right-0 left-0 h-12 flex justify-end items-center px-4 space-x-2 z-50 app-drag-region pointer-events-none">
          <div className="flex space-x-1 pointer-events-auto no-drag p-1">
            <button
              onClick={handleMinimize}
              className="w-8 h-6 flex items-center justify-center rounded hover:bg-gray-300 text-gray-500 hover:text-gray-800 transition-colors"
              title="最小化"
            >
              <svg width="10" height="1" viewBox="0 0 10 1"><path fill="currentColor" d="M0 0h10v1H0z" /></svg>
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-6 flex items-center justify-center rounded hover:bg-gray-300 text-gray-500 hover:text-gray-800 transition-colors"
              title="最大化"
            >
              <svg width="10" height="10" viewBox="0 0 10 10"><path fill="none" stroke="currentColor" strokeWidth="1" d="M1.5 1.5h7v7h-7z" /></svg>
            </button>
            <button
              onClick={handleCloseRequest}
              className="w-8 h-6 flex items-center justify-center rounded hover:bg-red-500 hover:text-white text-gray-500 transition-colors"
              title="关闭"
            >
              <svg width="10" height="10" viewBox="0 0 10 10"><path fill="currentColor" d="M1 0L0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4z" /></svg>
            </button>
          </div>
        </div>

        {/* Exit Confirmation Modal */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[320px] transform scale-100 transition-all border border-gray-200">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">确认退出程序？</h3>
                <p className="text-sm text-gray-500 mb-6">退出后将断开与交易核心的连接，无法继续接收行情和交易回报。</p>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCancelExit}
                    className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmExit}
                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-500/30 transition-colors"
                  >
                    确认退出
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assets' && renderAssetsPanel()}
        {activeTab === 'trade' && renderTradePanel()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'trades' && renderTrades()}

        {/* Toast Notification - Bottom Right */}
        {currentToast && (
          <div className="fixed bottom-6 right-6 z-[200] animate-fade-in">
            <div className={`px-4 py-3 rounded-lg shadow-lg text-white max-w-[800px] ${
              currentToast.type === 'error' ? 'bg-red-600' :
              currentToast.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm font-medium whitespace-pre-wrap break-all">{currentToast.message}</span>
                <button
                  onClick={() => setCurrentToast(null)}
                  className="text-white/80 hover:text-white flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};