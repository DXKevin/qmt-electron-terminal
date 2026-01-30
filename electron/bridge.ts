import { EventEmitter } from 'events';
import net from 'net';
import { Buffer } from 'buffer';
import { Protocol } from './protocol';

// Pipe Names defined by user
const PIPE_REQUEST = '\\\\.\\pipe\\request_pipe';
const PIPE_RESPONSE = '\\\\.\\pipe\\response_pipe';

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PythonBridge extends EventEmitter {
  private reqSocket: net.Socket | null = null;
  private resSocket: net.Socket | null = null;

  private reqIdCounter = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private parseChunk: (chunk: Buffer) => void;

  private isConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    // Initialize the protocol parser
    this.parseChunk = Protocol.createParser((msg) => {
      this.handleMessage(msg);
    });
  }

  public on(event: string, listener: (...args: any[]) => void): this {
    return EventEmitter.prototype.on.call(this, event, listener) as this;
  }

  public emit(event: string, ...args: any[]): boolean {
    return EventEmitter.prototype.emit.call(this, event, ...args);
  }

  start() {
    this.connectPipes();
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reqSocket?.destroy();
    this.resSocket?.destroy();
    this.isConnected = false;
  }

  private connectPipes() {
    if (this.isConnected) return;

    console.log(`[Bridge] Connecting to pipes...`);

    const req = net.createConnection(PIPE_REQUEST);
    const res = net.createConnection(PIPE_RESPONSE);

    let connectedCount = 0;
    const checkConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        this.isConnected = true;
        this.reqSocket = req;
        this.resSocket = res;
        console.log("[Bridge] Pipes Connected Successfully.");
        this.emit('log', "交易核心连接成功");
      }
    };

    req.on('connect', checkConnected);
    req.on('error', (err) => this.handleConnectionError(err, 'Request'));
    req.on('close', () => this.handleDisconnect('Request'));

    res.on('connect', checkConnected);
    res.on('data', (chunk) => { this.parseChunk(chunk); });
    res.on('error', (err) => this.handleConnectionError(err, 'Response'));
    res.on('close', () => this.handleDisconnect('Response'));
  }

  private handleConnectionError(err: Error, type: string) {
    console.error(`[Bridge] ${type} Pipe Error:`, err.message);
    // Even if it failed to connect initially, we should trigger a cleanup and retry
    this.handleDisconnect(type);
  }

  private handleDisconnect(type: string) {
    if (this.reconnectTimer) return;

    console.warn(`[Bridge] ${type} Pipe Disconnected or Connection Failed.`);
    this.isConnected = false;
    this.reqSocket?.destroy();
    this.resSocket?.destroy();
    this.reqSocket = null;
    this.resSocket = null;

    this.emit('log', "交易核心连接断开，3秒后重连...");
    this.emit('error', "Backend Disconnected");

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectPipes();
    }, 3000);
  }

  /**
   * Send a request to Python via request_pipe
   * Payload Structure matches Python: { action, req_id, params }
   */
  async sendRequest(action: string, params: any, timeout = 10000): Promise<any> {
    if (!this.isConnected || !this.reqSocket) {
      return { success: false, error: "核心未连接", code: "DISCONNECTED" };
    }

    const reqId = this.reqIdCounter++;

    // Construct Request Packet for RequestHandlerThread
    const payload = {
      action: action,
      req_id: reqId,
      params: params
    };

    const buffer = Protocol.encode(payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          resolve({ success: false, error: "请求超时", code: "TIMEOUT" });
        }
      }, timeout);

      this.pendingRequests.set(reqId, { resolve, reject, timer });

      try {
        this.reqSocket!.write(buffer);
      } catch (e) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        resolve({ success: false, error: e instanceof Error ? e.message : String(e), code: "WRITE_ERROR" });
      }
    });
  }

  private handleMessage(msg: any) {
    console.log(`[Bridge] Parsed Message:`, msg);
    // 1. Handle Request Responses (Matched by reqId)
    // Note: The Python side might return keys like "req_id" or "reqId", adapt as needed.
    // Based on previous prompt, we assume standard JSON msg.
    const rId = msg.req_id !== undefined ? msg.req_id : msg.reqId;

    if (rId !== undefined && rId !== null) {
      const req = this.pendingRequests.get(rId);
      if (req) {
        clearTimeout(req.timer);
        this.pendingRequests.delete(rId);

        if (msg.error) {
          req.resolve({ success: false, error: msg.error });
        } else {
          // If response has 'data' field return that wrapped in success
          const data = msg.data !== undefined ? msg.data : msg;
          req.resolve({ success: true, data });
        }
      }
      return;
    }

    if (msg.event) {
      this.emit(msg.event, msg.data);
    }
  }
}