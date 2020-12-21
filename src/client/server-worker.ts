import type { RpcMap } from '../server/run-worker';

export class ServerWorker {
  public worker = new Worker('../server/run-worker.ts');

  public init = this._createRpc('init') as typeof RpcMap['init'];
  public listMaps = this._createRpc('listMaps') as typeof RpcMap['listMaps'];
  public generateMap = this._createRpc('generateMap', 'canvas') as typeof RpcMap['generateMap'];
  public saveGeneratedMap = this._createRpc('saveGeneratedMap') as typeof RpcMap['saveGeneratedMap'];
  public startServer = this._createRpc('startServer') as typeof RpcMap['startServer'];
  private _rpcCallbacks = new Map<number, (...args: any) => void>();
  private _nextRpcId = 1;

  public constructor() {
    this.worker.onmessage = (e) => {
      if (!e.data.rpc) throw new Error('unexpected message from server worker');

      const cb = this._rpcCallbacks.get(e.data.rpc);
      if (!cb) throw new Error(`could not find callback for rpc ${e.data.rpc}`);
      this._rpcCallbacks.delete(e.data.rpc);
      cb(e.data.result);
    };
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
