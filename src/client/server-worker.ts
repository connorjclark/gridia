import type {RpcMap} from '../server/run-worker.js';

export class ServerWorker {
  worker = new Worker(process.env.GRIDIA_SERVER_WORKER_PATH || 'unknown');

  init = this._createRpc('init') as typeof RpcMap['init'];
  listMaps = this._createRpc('listMaps') as typeof RpcMap['listMaps'];
  generateMap = this._createRpc('generateMap', 'canvas') as typeof RpcMap['generateMap'];
  saveGeneratedMap = this._createRpc('saveGeneratedMap') as typeof RpcMap['saveGeneratedMap'];
  startServer = this._createRpc('startServer') as typeof RpcMap['startServer'];
  shutdown = this._createRpc('shutdown') as typeof RpcMap['shutdown'];
  private _rpcCallbacks = new Map<number, (...args: any) => void>();
  private _nextRpcId = 1;

  constructor() {
    this._onMessage = this._onMessage.bind(this);
    this.worker.addEventListener('message', this._onMessage);
  }

  close() {
    this.worker.terminate();
    this.worker.removeEventListener('message', this._onMessage);
  }

  private _onMessage(e: MessageEvent) {
    if (!e.data.rpc) return;

    const cb = this._rpcCallbacks.get(e.data.rpc);
    if (!cb) throw new Error(`could not find callback for rpc ${e.data.rpc}`);
    this._rpcCallbacks.delete(e.data.rpc);
    cb(e.data.result);
  }

  private _createRpc(method: string, ...transferKeys: string[]) {
    return (args: any = []) => {
      const transfers: Transferable[] = [];
      for (const key of transferKeys) {
        // @ts-ignore
        if (args[key]) transfers.push(args[key]);
      }

      const id = this._nextRpcId++;
      this.worker.postMessage({
        type: 'rpc',
        method,
        id,
        args,
      }, transfers);

      return new Promise((resolve) => {
        this._rpcCallbacks.set(id, resolve);
      });
    };
  }
}
