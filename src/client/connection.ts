import * as WireSerializer from '../lib/wire-serializer';
import { ProtocolCommand } from '../protocol/command-builder';
import { ProtocolEvent } from '../protocol/event-builder';

function debug(prefix: string, msg: Message) {
  // @ts-ignore
  if (!window.Gridia.debug && !window.Gridia.debugn) return;
  // @ts-ignore
  if (window.Gridia.debug instanceof RegExp && !window.Gridia.debug.test(msg.type)) return;
  // @ts-ignore
  if (window.Gridia.debugn instanceof RegExp && window.Gridia.debugn.test(msg.type)) return;

  let value = '';
  if (msg.data && msg.data.args) value = msg.data.args;
  else if (msg.data) value = msg.data;
  else if (msg.data && msg.data.error) value = msg.data.error;

  const json = JSON.stringify(value);

  const prefixColor = prefix === '<-' ? 'darkblue' : 'darkgreen';
  const args = [
    `%c${prefix}`,
    `background: ${prefixColor}; color: white`,
    msg.data?.type,
  ];
  if (json.length > 60) {
    args.push(value);
  } else {
    args.push(json);
  }
  console.log(...args);
}

export abstract class Connection {
  protected _onEvent?: (event: ProtocolEvent) => void;

  private nextId = 1;
  private idToCallback = new Map<number, { resolve: Function; reject: Function }>();

  setOnEvent(onEvent?: (event: ProtocolEvent) => void) {
    this._onEvent = onEvent;
  }

  sendCommand<T extends ProtocolCommand>(command: T): Promise<T['args']['response']> {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.idToCallback.set(id, { resolve, reject });
    });
    this.send_({
      id,
      data: command,
    });
    // @ts-ignore
    return promise;
  }

  protected resolveCommand(id: number, data: any) {
    const cbs = this.idToCallback.get(id);
    if (!cbs) throw new Error('unknown id ' + id);

    this.idToCallback.delete(id);
    if (data && data.error) {
      cbs.reject(data.error);
    } else {
      cbs.resolve(data);
    }
  }

  public abstract close(): void;

  protected abstract send_(message: { id: number; data: ProtocolCommand }): void;
}

export class WebSocketConnection extends Connection {
  constructor(private _ws: WebSocket) {
    super();
    _ws.addEventListener('message', (e) => {
      const message = WireSerializer.deserialize<Message>(e.data);
      debug('<-', message);

      if (message.id) {
        this.resolveCommand(message.id, message.data);
        return;
      }

      if (this._onEvent) this._onEvent(message.data);
    });

    _ws.addEventListener('close', this.onClose);
  }

  send_(message: { id: number; data: ProtocolCommand }) {
    debug('->', message);
    this._ws.send(WireSerializer.serialize(message));
  }

  close() {
    this._ws.removeEventListener('close', this.onClose);
    this._ws.close();
  }

  private onClose() {
    window.document.body.innerText = 'Lost connection to server. Please refresh.';
  }
}

export class WorkerConnection extends Connection {
  constructor(private _worker: Worker) {
    super();
    _worker.onmessage = (e) => {
      const message = WireSerializer.deserialize<Message>(e.data);
      debug('<-', message);

      if (message.id) {
        this.resolveCommand(message.id, message.data);
        return;
      }

      if (this._onEvent) this._onEvent(message.data);
    };
  }

  send_(message: { id: number; data: ProtocolCommand }) {
    debug('->', message);
    this._worker.postMessage(WireSerializer.serialize(message));
  }

  close() {
    delete this._worker.onmessage;
  }
}
