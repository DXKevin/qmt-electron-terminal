import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TickData, AccountInfo, OrderRequest, OrderStatus, Position, Trade } from './types';

// ----------------------------------------------------------------------
// TYPES & CONSTANTS
// ----------------------------------------------------------------------

type TabType = 'assets' | 'trade' | 'orders' | 'trades' | 'logs';
type SortDirection = 'asc' | 'desc';
// Removed LIMIT_UP and LIMIT_DOWN from PriceMode as they are now static fills
type PriceMode = 'LIMIT' | 'BEST_5' | 'OPPOSITE' | 'CAGE';

const STOCK_MAP: Record<string, string> = {
  '600000': '浦发银行',
  '600519': '贵州茅台',
  '000001': '平安银行',
  '000725': '京东方A',
  '300750': '宁德时代',
  '601127': '赛力斯',
  '601888': '中国中免'
};

// Mock Accounts for Multi-Account Feature
const MOCK_MULTI_ACCOUNTS = [
  { id: '888001', name: '主策略账户', type: '普通', cash: 450000.50 },
  { id: '888002', name: '激进打板', type: '信用', cash: 120000.00 },
  { id: '888003', name: '稳健理财', type: '普通', cash: 890000.00 },
  { id: '888005', name: '量化测试', type: '普通', cash: 50000.00 },
  { id: '888006', name: '跟随策略A', type: '普通', cash: 200000.00 },
];

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
  | { type: 'RATIO', value: number, label: string };

export const App: React.FC = () => {
  // Data State
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<OrderStatus[]>([]);
  const [ticks, setTicks] = useState<TickData[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('trade');
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY'); // Track active side
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true); // New Sidebar State

  // Multi-Account State
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(['888001']);

  // Trade Form State
  const [symbol, setSymbol] = useState('600000.SH');
  const [stockName, setStockName] = useState('浦发银行');
  const [price, setPrice] = useState<string>('');

  // --- VOLUME STRATEGY STATE ---
  // Replaces simple string volume to handle "Percentage Strategy"
  const [volStrategy, setVolStrategy] = useState<VolumeStrategy>({ type: 'MANUAL', value: '100' });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceType, setPriceType] = useState<PriceMode>('LIMIT'); // Track price mode

  // Window Controls State
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Initialize listeners
  useEffect(() => {
    window.electronAPI.onSystemLog((msg) => addLog(msg));

    window.electronAPI.onTick((data) => {
      setTicks(prev => {
        return [data];
      });
    });

    window.electronAPI.onOrderUpdate((order) => {
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

    fetchData();
  }, [addLog]);

  // Scroll logs when on Logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  // DYNAMIC PRICE UPDATE LOGIC
  useEffect(() => {
    // If manual limit, do nothing
    if (priceType === 'LIMIT') return;

    const tick = ticks.length > 0 && ticks[0].symbol === symbol ? ticks[0] : null;
    if (!tick) return;

    const calcPrice = calculateAutoPrice(priceType, tick, tradeSide);
    if (calcPrice) {
      setPrice(calcPrice);
    }
  }, [ticks, priceType, tradeSide, symbol]);


  const fetchData = async () => {
    try {
      const queryId = selectedAccountIds.length > 0 ? selectedAccountIds[0] : '888001';

      const accRes = await window.electronAPI.getAccount(queryId);
      if (accRes && accRes.success) {
        setAccount(accRes.data);
      } else if (accRes && accRes.error) {
        addLog(`获取账户失败: ${accRes.error}`);
      }

      const posRes = await window.electronAPI.getPositions(queryId);
      if (posRes && posRes.success) {
        setPositions(posRes.data);
      }

      const trdRes = await window.electronAPI.getTrades(queryId);
      if (trdRes && trdRes.success) {
        setTrades(trdRes.data);
      }
    } catch (e: any) {
      addLog(`数据获取异常: ${e.message}`);
    }
  };

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

  const calculateAutoPrice = (mode: PriceMode, tick: TickData, side: 'BUY' | 'SELL'): string | null => {
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
        case 'CAGE': target = curPrice * 1.02; break;
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
        case 'CAGE': target = curPrice * 0.98; break;
        default: return null;
      }
    }
    return target.toFixed(2);
  };

  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const name = STOCK_MAP[code] || "未知";
      setStockName(name);
      if (val.includes('.')) handleSubscribe(val);
    } else {
      setStockName("");
    }
  };

  const handleSubscribe = async (sym: string) => {
    try {
      const res = await window.electronAPI.subscribe(sym);
      if (res && !res.success) {
        addLog(`订阅失败: ${res.error}`);
      }
    } catch (e: any) {
      addLog(`订阅异常: ${e.message}`);
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
  };

  // Manual Input Change
  const handleVolumeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolStrategy({ type: 'MANUAL', value: e.target.value });
  };

  const handlePricePreset = (type: PriceMode) => {
    setPriceType(type);
    if (currentTick) {
      const p = calculateAutoPrice(type, currentTick, tradeSide);
      if (p) setPrice(p);
    } else {
      // Fallback if no tick
      const p = calculateAutoPrice(type, { lastPrice: parseFloat(price) || 0, asks: [], bids: [], volume: 0, time: '', symbol: '' }, tradeSide);
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
    if (isSubmitting) return;
    if (selectedAccountIds.length === 0) {
      addLog("错误: 请至少选择一个账户");
      return;
    }

    setIsSubmitting(true);
    try {
      const p = parseFloat(price) || currentPrice;

      addLog(`启动批量下单: 共 ${selectedAccountIds.length} 个账户`);

      const promises = selectedAccountIds.map(async (accId) => {
        // --- DYNAMIC VOLUME CALCULATION PER ACCOUNT ---
        let finalVolume = 0;

        if (volStrategy.type === 'MANUAL') {
          finalVolume = parseInt(volStrategy.value) || 0;
        } else {
          // RATIO STRATEGY
          const ratio = volStrategy.value;

          if (action === 'BUY') {
            // Find mock account data (In real app, fetch fresh data)
            const accData = MOCK_MULTI_ACCOUNTS.find(a => a.id === accId);
            if (accData && p > 0) {
              const targetCash = accData.cash * ratio;
              finalVolume = Math.floor((targetCash / p) / 100) * 100;
            }
          } else {
            // SELL
            const pos = positions.find(po => po.accountId === accId && po.symbol === symbol);
            if (pos) {
              finalVolume = Math.floor((pos.canUseVolume * ratio) / 100) * 100;
            }
          }
        }

        if (finalVolume <= 0) {
          addLog(`> 账户[${accId}] 忽略: 计算数量为 0`);
          return;
        }

        const order: OrderRequest = {
          account_id: accId,
          symbol: symbol,
          order_type: action === 'BUY' ? 'buy' : 'sell',
          price_type: 'limit',
          price: p,
          volume: finalVolume,
          strategy_name: 'QMT_PRO_MANUAL',
          remark: 'Manual Order'
        };

        const res = await window.electronAPI.sendOrder(order);
        if (res && res.success) {
          addLog(`> 账户[${accId}] 下单成功: ${finalVolume}股`);
        } else {
          addLog(`> 账户[${accId}] 下单失败: ${res?.error || '未知错误'}`);
        }
      });

      await Promise.all(promises);
      addLog("批量下单请求已发送");

    } catch (e: any) {
      addLog(`下单异常: ${e.message}`);
    } finally {
      setIsSubmitting(false);
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

  const currentTick = ticks.length > 0 && ticks[0].symbol === symbol ? ticks[0] : null;
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

  const renderOrderBook = () => {
    if (!currentTick) return <div className={`flex-1 flex items-center justify-center text-xs ${colors.textMuted}`}>等待行情...</div>;

    const asks = currentTick.asks || [];
    const bids = currentTick.bids || [];
    const reversedAsks = [...asks].slice(0, 5).reverse();
    const visibleBids = [...bids].slice(0, 5);
    const maxVol = Math.max(...asks.map(a => a[1]), ...bids.map(b => b[1]), 1);

    return (
      <div className="flex flex-col h-full font-mono text-xs select-none">
        {/* ASKS (Sell - Blue) */}
        <div className="flex-1 flex flex-col justify-end mb-2 space-y-0.5">
          {reversedAsks.map((ask, i) => {
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
                <span className="relative z-10 text-blue-600 font-medium">{ask[0].toFixed(2)}</span>
                <span className={`relative z-10 w-12 text-right ${colors.textMuted}`}>{ask[1]}</span>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className={`h-px w-full my-1 bg-gray-300`}></div>

        {/* BIDS (Buy - Red) */}
        <div className="flex-1 flex flex-col justify-start mt-1 space-y-0.5">
          {visibleBids.map((bid, i) => {
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
                <span className="relative z-10 text-red-600 font-medium">{bid[0].toFixed(2)}</span>
                <span className={`relative z-10 w-12 text-right ${colors.textMuted}`}>{bid[1]}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAccountSelector = () => (
    <div className={`w-[220px] flex flex-col rounded-3xl overflow-hidden shadow-sm ${colors.card} flex-shrink-0`}>
      <div className="bg-gray-50 border-b border-gray-200 p-3 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">多账户选择</span>
        <button
          onClick={handleSelectAllAccounts}
          className="text-xs text-blue-600 font-bold hover:text-blue-700"
        >
          {selectedAccountIds.length === MOCK_MULTI_ACCOUNTS.length ? '全不选' : '全选'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {MOCK_MULTI_ACCOUNTS.map(acc => {
          const isSelected = selectedAccountIds.includes(acc.id);

          // Dynamic Content Logic
          let dynamicValue = '';
          let dynamicLabel = '';
          let dynamicColor = '';

          if (tradeSide === 'BUY') {
            dynamicValue = `¥${acc.cash.toLocaleString()}`;
            dynamicLabel = '可买';
            dynamicColor = 'text-red-600';
          } else {
            const pos = positions.find(p => p.accountId === acc.id && p.symbol === symbol);
            const vol = pos ? pos.canUseVolume : 0;
            dynamicValue = `${vol}股`;
            dynamicLabel = '可卖';
            dynamicColor = vol > 0 ? 'text-blue-600' : 'text-gray-300';
          }

          return (
            <div
              key={acc.id}
              onClick={() => handleToggleAccount(acc.id)}
              className={`p-2 rounded-xl cursor-pointer border transition-all flex items-center gap-2 group ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:bg-gray-50'}`}
            >
              <div className={`w-4 h-4 rounded border flex flex-shrink-0 items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                {/* Row 1: Name & Label */}
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>{acc.name}</span>
                  <span className="text-[10px] text-gray-400 scale-90 origin-right">{dynamicLabel}</span>
                </div>

                {/* Row 2: ID & Value */}
                <div className="flex justify-between items-baseline mt-0.5">
                  <span className="text-[10px] text-gray-400 font-mono">{acc.id}</span>
                  <span className={`text-xs font-mono font-bold ${dynamicColor}`}>{dynamicValue}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );

  const renderAssetsPanel = () => (
    <div className="p-8 h-full overflow-y-auto pt-10">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
        <span className="bg-blue-600 w-1.5 h-6 mr-3 rounded-full"></span>
        资金账户总览
      </h2>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className={`p-6 rounded-2xl ${colors.card} bg-gradient-to-br from-white to-gray-50`}>
          <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">总资产</div>
          <div className="text-4xl font-mono font-bold text-gray-900">{account?.assets.toLocaleString() || '---'} <span className="text-sm font-normal text-gray-400">CNY</span></div>
        </div>
        <div className={`p-6 rounded-2xl ${colors.card} bg-gradient-to-br from-white to-gray-50`}>
          <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">持仓市值</div>
          <div className="text-4xl font-mono font-bold text-blue-600">{account?.marketValue.toLocaleString() || '---'}</div>
        </div>
        <div className={`p-6 rounded-2xl ${colors.card} bg-gradient-to-br from-white to-gray-50`}>
          <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">可用资金</div>
          <div className="text-4xl font-mono font-bold text-green-600">{account?.cash.toLocaleString() || '---'}</div>
        </div>
      </div>

      {/* Account Details / Sub-Accounts Mock */}
      <div className={`rounded-xl overflow-hidden ${colors.card}`}>
        <div className={`px-6 py-4 border-b ${colors.border} flex justify-between items-center bg-gray-50`}>
          <span className="font-bold text-gray-700">账户列表</span>
          <span className="text-xs font-mono text-gray-400">ID: {account?.accountId}</span>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-white text-gray-500 font-medium border-b border-gray-200">
            <tr>
              <th className="px-6 py-2">账户名称</th>
              <th className="px-6 py-2">账户类型</th>
              <th className="px-6 py-2 text-right">总资产</th>
              <th className="px-6 py-2 text-right">可用资金</th>
              <th className="px-6 py-2 text-center">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 font-bold text-gray-800">股票实盘账户</td>
              <td className="px-6 py-3 text-gray-500">普通A股</td>
              <td className="px-6 py-3 text-right font-mono">{account?.assets.toLocaleString()}</td>
              <td className="px-6 py-3 text-right font-mono text-green-600">{account?.cash.toLocaleString()}</td>
              <td className="px-6 py-3 text-center"><span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">正常</span></td>
            </tr>
            {/* Mocking a second account for "Summary" feel */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 font-bold text-gray-800">信用融资账户</td>
              <td className="px-6 py-3 text-gray-500">信用两融</td>
              <td className="px-6 py-3 text-right font-mono">0.00</td>
              <td className="px-6 py-3 text-right font-mono text-green-600">0.00</td>
              <td className="px-6 py-3 text-center"><span className="px-2 py-1 bg-gray-100 text-gray-400 rounded-full text-xs font-bold">未激活</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPositionsTableContent = () => (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">账户</th>
            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">代码/名称</th>
            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">持仓/可用</th>
            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">现价/成本</th>
            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">市值</th>
            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">盈亏</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {positions.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">暂无持仓数据</td>
            </tr>
          ) : (
            sortData(positions).map((pos, idx) => {
              // Find current price for this symbol if available
              const tick = ticks.find(t => t.symbol === pos.symbol);
              const curPrice = tick ? tick.lastPrice : pos.openPrice; // fallback
              const profit = (curPrice - pos.openPrice) * pos.volume;
              const profitPercent = pos.openPrice > 0 ? (profit / (pos.openPrice * pos.volume)) * 100 : 0;

              return (
                <tr key={`${pos.accountId}-${pos.symbol}-${idx}`} className="hover:bg-blue-50 transition-colors cursor-pointer group" onClick={() => { setSymbol(pos.symbol); handleSubscribe(pos.symbol); }}>
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
                    <div className={`text-sm font-mono font-bold ${curPrice > pos.openPrice ? 'text-red-600' : curPrice < pos.openPrice ? 'text-green-600' : 'text-gray-900'}`}>{curPrice.toFixed(2)}</div>
                    <div className="text-xs font-mono text-gray-400">{pos.openPrice.toFixed(2)}</div>
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

  const renderTableList = (columns: any[], data: any[], rowRenderer: any) => (
    <div className={`h-full w-full flex flex-col p-8 pt-10`}>
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

  const renderOrders = () => renderTableList(
    [
      { label: "时间", sortKey: "orderTime", className: "w-32" },
      { label: "代码", sortKey: "symbol", className: "w-32" },
      { label: "名称", className: "w-32" },
      { label: "方向", sortKey: "action", className: "w-24", align: "center" },
      { label: "价格", sortKey: "price", align: "right", className: "w-32" },
      { label: "数量", sortKey: "volume", align: "right", className: "w-32" },
      { label: "状态", sortKey: "status", align: "center", className: "w-32" },
      { label: "说明", className: "flex-1" },
    ],
    sortData(orders),
    (o: OrderStatus) => {
      const cell = (content: React.ReactNode, width: string, align: 'left' | 'center' | 'right' = 'left') => (
        <div className={`${width} px-6 py-2 text-sm flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          {content}
        </div>
      );
      return (
        <React.Fragment>
          {cell(<div className="text-xs font-mono text-gray-400">{o.orderTime?.split(' ')[0] || '--'}</div>, "w-32")}
          {cell(<div className="font-mono font-bold text-gray-800">{o.symbol}</div>, "w-32")}
          {cell(<div className="font-medium text-gray-700">{o.stockName}</div>, "w-32")}
          {cell(<div className={`font-bold text-xs px-2 py-1 rounded ${o.action === 'BUY' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{o.action === 'BUY' ? '买入' : '卖出'}</div>, "w-24", "center")}
          {cell(<div className="font-mono text-gray-600">{o.price.toFixed(2)}</div>, "w-32", "right")}
          {cell(<div className="font-mono text-gray-600">{o.filledVolume}/{o.volume}</div>, "w-32", "right")}
          {cell(<span className={`px-2 py-1 rounded text-[10px] font-bold ${o.status === 'FILLED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{o.status}</span>, "w-32", "center")}
          {cell(<div className="text-xs text-gray-400 truncate">{o.msg}</div>, "flex-1")}
        </React.Fragment>
      )
    }
  );

  const renderTrades = () => renderTableList(
    [
      { label: "时间", sortKey: "time", className: "w-32" },
      { label: "代码", sortKey: "symbol", className: "w-32" },
      { label: "名称", className: "w-32" },
      { label: "方向", sortKey: "action", className: "w-24", align: "center" },
      { label: "价格", sortKey: "price", align: "right", className: "w-32" },
      { label: "数量", sortKey: "volume", align: "right", className: "w-32" },
      { label: "金额", sortKey: "amount", align: "right", className: "flex-1" },
    ],
    sortData(trades),
    (t: Trade, i: number) => {
      const cell = (content: React.ReactNode, width: string, align: 'left' | 'center' | 'right' = 'left') => (
        <div className={`${width} px-6 py-2 text-sm flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          {content}
        </div>
      );
      return (
        <React.Fragment>
          {cell(<div className="text-xs font-mono text-gray-400">{t.time}</div>, "w-32")}
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
    <div className={`h-full w-full flex flex-col ${colors.contentBg} pt-10`}>
      <div className="h-full flex flex-col p-6 pt-8">
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
    <div className="flex flex-col h-full w-full p-6 gap-6 pt-8"> {/* Added top padding for window controls */}

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
                  value={volStrategy.type === 'RATIO' ? volStrategy.label : volStrategy.value}
                  onChange={handleVolumeInputChange}
                  onClick={() => {
                    if (volStrategy.type === 'RATIO') {
                      setVolStrategy({ type: 'MANUAL', value: '' });
                    }
                  }}
                  className={`w-full py-1.5 pl-8 pr-8 rounded-xl border-2 outline-none font-mono text-lg font-bold text-center transition-all ${volStrategy.type === 'RATIO' ? 'border-purple-400 bg-purple-50 text-purple-700' : colors.input} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
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

            {/* Submit Button - Added margin and padding for better spacing */}
            <div className="mt-4">
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
        <div className="flex-1 overflow-hidden relative">
          {renderPositionsTableContent()}
        </div>
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
            { id: 'logs', label: '系统日志', Icon: Icons.Logs },
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
        <div className="absolute top-0 right-0 left-0 h-10 flex justify-end items-center px-4 space-x-2 z-50 app-drag-region pointer-events-none">
          <div className="flex space-x-1 pointer-events-auto no-drag bg-gray-200/50 backdrop-blur-sm p-1 rounded-lg border border-gray-300/50">
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
          <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center fade-in">
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
        {activeTab === 'logs' && renderLogs()}
      </div>
    </div>
  );
};