import { Message as MessageToServer } from '../protocol/client-to-server-protocol-builder';
import { Message as MessageToClient } from '../protocol/server-to-client-protocol-builder';

function debug(prefix: string , msg: any) {
  // @ts-ignore
  if (!window.Gridia.debug && !window.Gridia.debugn) return;
  // @ts-ignore
  if (window.Gridia.debug instanceof RegExp && !window.Gridia.debug.test(msg.type)) return;
  // @ts-ignore
  if (window.Gridia.debugn instanceof RegExp && window.Gridia.debugn.test(msg.type)) return;

  const json = JSON.stringify(msg.args);
  const prefixColor = prefix === '<-' ? 'darkblue' : 'darkgreen';
  const args = [
    `%c${prefix}`,
    `background: ${prefixColor}; color: white`,
    msg.type,
  ];
  if (json.length > 60) {
    args.push(msg.args);
  } else {
    args.push(json);
  }
  console.log(...args);
}

export abstract class Connection {
  protected _onMessage?: (message: MessageToClient) => void;

  public setOnMessage(onMessage?: (message: MessageToClient) => void)  {
    this._onMessage = onMessage;
  }

  public abstract send(message: MessageToServer): void;

  public abstract close(): void;
}

export class WebSocketConnection extends Connection {
  public constructor(private _ws: WebSocket) {
    super();
    _ws.addEventListener('message', (e) => {
      if (!this._onMessage) return;
      const data = JSON.parse(e.data);
      debug('<-', data);
      this._onMessage(data);
    });

    _ws.addEventListener('close', this.onClose);
  }

  public send(message: MessageToServer) {
    debug('->', message);
    this._ws.send(JSON.stringify(message));
  }

  public close() {
    this._ws.removeEventListener('close', this.onClose);
    this._ws.close();
  }

  private onClose() {
    window.document.body.innerText = 'Lost connection to server. Please refresh.';
  }
}

export class WorkerConnection extends Connection {
  public constructor(private _worker: Worker) {
    super();
    _worker.onmessage = (e) => {
      debug('<-', e.data);
      if (this._onMessage) this._onMessage(e.data);
    };
  }

  public send(message: MessageToServer) {
    debug('->', message);
    this._worker.postMessage(message);
  }

  public close() {
    delete this._worker.onmessage;
  }
}
