import { Message as MessageToServer } from '../protocol/client-to-server-protocol-builder';
import { Message as MessageToClient } from '../protocol/server-to-client-protocol-builder';

export abstract class Connection {
  protected _onMessage?: (message: MessageToClient) => void;

  public setOnMessage(onMessage?: (message: MessageToClient) => void)  {
    this._onMessage = onMessage;
  }

  public abstract send(message: MessageToServer): void;
}

export class WebSocketConnection extends Connection {
  constructor(private _ws: WebSocket) {
    super();
    _ws.addEventListener('message', (e) => {
      if (this._onMessage) this._onMessage(JSON.parse(e.data));
    });
  }

  public send(message: MessageToServer) {
    this._ws.send(JSON.stringify(message));
  }
}

export class WorkerConnection extends Connection {
  constructor(private _worker: Worker) {
    super();
    _worker.onmessage = (e) => {
      if (this._onMessage) this._onMessage(e.data);
    };
  }

  public send(message: MessageToServer) {
    this._worker.postMessage(message);
  }
}
