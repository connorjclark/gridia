import { Message } from '../protocol/server-to-client-protocol-builder';

export abstract class Connection {
  protected _onMessage: (message: Message) => void = undefined;

  // constructor() {
  //   this._onMessage = undefined;
  // }

  public setOnMessage(onMessage: (message: Message) => void)  {
    this._onMessage = onMessage;
  }

  public abstract send(message);
}

export class WebSocketConnection extends Connection {
  constructor(private _ws: WebSocket) {
    super();
    _ws.addEventListener('message', (e) => {
      this._onMessage(JSON.parse(e.data));
    });
  }

  public send(message: Message) {
    this._ws.send(JSON.stringify(message));
  }
}

export class WorkerConnection extends Connection {
  constructor(private _worker: Worker) {
    super();
    _worker.onmessage = (e) => {
      this._onMessage(e.data);
    };
  }

  public send(message: Message) {
    this._worker.postMessage(message);
  }
}
