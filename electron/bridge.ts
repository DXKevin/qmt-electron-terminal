import fs from 'fs';
import net from 'net';
import { EventEmitter } from 'events';
import { Protocol } from './protocol';

export class PythonBridge extends EventEmitter {
  // --- 管道配置 ---
  private readonly PIPE_REQ = '\\\\.\\pipe\\request_pipe'; // 发送给Python
  private readonly PIPE_RES = '\\\\.\\pipe\\response_pipe'; // 接收Python发来的

  // --- 内部状态 ---
  private reqStream: fs.WriteStream | null = null;
  private resServer: net.Server | null = null;
  private resSocket: net.Socket | null = null;

  private isReqConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // --- 事务管理 (Request-Response) ---
  private reqIdCounter = 1;
  private pendingRequests = new Map<number, { resolve: (data: any) => void; timer: ReturnType<typeof setTimeout> }>();

  // --- 协议解析 ---
  private parseChunk: (chunk: Buffer) => void;

  constructor() {
    super();
    // 创建一个解析器，收到完整包后调用 this.handleMessage
    this.parseChunk = Protocol.createParser((msg) => this.handleMessage(msg));
  }

  /**
   * 启动！
   * 同时启动 发送端(Client) 和 接收端(Server)
   */
  public start() {
    this.startResServer();
    this.connectReqPipe();
  }

  /**
   * 停止！释放所有资源
   */
  public stop() {
    // 1. 清理发送端
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reqStream?.destroy();
    this.reqStream = null;
    this.isReqConnected = false;

    // 2. 清理接收端
    this.resSocket?.destroy();
    this.resSocket = null;
    this.resServer?.close();
    this.resServer = null;

    // 3. 拒绝所有挂起的请求
    this.pendingRequests.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve({ success: false, error: "Bridge stopped" });
    });
    this.pendingRequests.clear();
  }


  // ==========================================
  // Part 1: 发送端逻辑 (原 RequestClient)
  // ==========================================

  private connectReqPipe() {
    if (this.isReqConnected) return;

    const stream = fs.createWriteStream(this.PIPE_REQ, { autoClose: true });

    stream.on('open', () => {
      this.reqStream = stream;
      this.isReqConnected = true;
      console.log(`[Bridge] Write-Pipe Connected: ${this.PIPE_REQ}`);
      // this.checkLinkStatus();
    });

    stream.on('error', (err) => {
      // console.error(`[Bridge] Write-Pipe Error: ${err.message}`);
      this.handleReqDisconnect(err.message);
    });

    stream.on('close', () => {
      this.handleReqDisconnect('Stream closed');
    });
  }

  private handleReqDisconnect(reason: string) {
    if (this.reconnectTimer) return; // 已经在重连中了

    console.warn(`[Bridge] Write-Pipe Disconnected (${reason}). Retrying in 3s...`);
    this.isReqConnected = false;
    this.reqStream?.destroy();
    this.reqStream = null;
    // this.checkLinkStatus();

    // 3秒后重试
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectReqPipe();
    }, 3000);
  }

  // ==========================================
  // Part 2: 接收端逻辑 (原 ResponseServer)
  // ==========================================

  private startResServer() {
    if (this.resServer) return;

    this.resServer = net.createServer((socket) => {
      // 只允许一个 Python 连接，挤掉旧的
      if (this.resSocket) {
        this.resSocket.destroy();
      }

      this.resSocket = socket;
      // console.log(`[Bridge] Read-Pipe Client Connected!`);
      // this.checkLinkStatus();

      socket.on('data', (chunk) => {
        this.parseChunk(chunk); // 喂给协议解析器
      });

      socket.on('error', (err) => {
        console.error(`[Bridge] Read-Pipe Socket Error: ${err.message}`);
      });

      socket.on('close', () => {
        // console.warn(`[Bridge] Read-Pipe Client Disconnected`);
        this.resSocket = null;
        // this.checkLinkStatus();
      });
    });

    this.resServer.listen(this.PIPE_RES, () => {
      console.log(`[Bridge] Listening on ${this.PIPE_RES}`);
    });
  }

  // ==========================================
  // Part 3: 核心逻辑 (原 TransactionManager)
  // ==========================================

  /**
   * 发送请求并等待结果 (Request-Response)
   */
  public async sendRequest(action: string, params: any, timeout = 10000): Promise<any> {
    const reqId = this.reqIdCounter++;
    const payload = { action, req_id: reqId, params };

    return new Promise((resolve) => {
      // 1. 设置超时
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          resolve({ success: false, error: "Timeout", code: "TIMEOUT" });
        }
      }, timeout);

      // 2. 只有管道通了才能发
      if (!this.reqStream || !this.isReqConnected) {
        clearTimeout(timer);
        resolve({ success: false, error: "Pipe not ready", code: "PIPE_ERROR" });
        return;
      }

      // 3. 记录到 Map 中
      this.pendingRequests.set(reqId, { resolve, timer });

      // 4. 写数据
      try {
        const buffer = Protocol.encode(payload);
        this.reqStream.write(buffer);
      } catch (e) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        resolve({ success: false, error: "Write failed" });
      }
    });
  }

  /**
   * 仅发送通知，不等待结果 (Fire-and-Forget)
   * @returns boolean - true 表示写入管道成功，false 表示失败
   */
  public sendNotify(action: string, params: any): boolean {
    if (!this.reqStream || !this.isReqConnected) return false;
    try {
      // req_id = null 表示这是一个通知
      const payload = { action, req_id: null, params };
      this.reqStream.write(Protocol.encode(payload));
      return true;
    } catch (e) {
      console.error("[Bridge] Send notify failed", e);
      return false;
    }
  }

  /**
   * 处理从 Python 收到的完整消息
   */
  private handleMessage(msg: any) {
    // 情况 A: 这是一个对之前请求的回执 (有 req_id)
    const rId = msg.req_id !== undefined ? msg.req_id : msg.reqId;
    if (rId && this.pendingRequests.has(Number(rId))) {
      const { resolve, timer } = this.pendingRequests.get(Number(rId))!;
      clearTimeout(timer);
      this.pendingRequests.delete(Number(rId));

      // 返回结果
      if (msg.error) {
        resolve({ success: false, error: msg.error });
      } else {
        const data = msg.data !== undefined ? msg.data : msg;
        resolve({ success: true, data });
      }
      return;
    }

    // 情况 B: 这是一个主动推送的事件 (Event)
    if (msg.event) {
      this.emit(msg.event, msg.data);
      return;
    }

    // 情况 C: 未知消息
    // console.log("[Bridge] Unknown message:", msg);
  }

  // private checkLinkStatus() {
  //   const sendOk = this.isReqConnected;
  //   const recvOk = !!this.resSocket;

  //   // 简单的状态变更日志
  //   // console.log(`[Bridge Status] SEND=${sendOk}, RECV=${recvOk}`);

  //   if (sendOk && recvOk) {
  //     this.emit('log', '通信链路就绪 (双向)');
  //   }
  // }
}