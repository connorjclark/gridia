import * as WireSerializer from '../lib/wire-serializer';
import { Command } from '../protocol/command-builder';
import { Event } from '../protocol/event-builder';

function debug(prefix: string, msg: Message) {
  // @ts-ignore
  if (!window.Gridia.debug && !window.Gridia.debugn) return;
  // @ts-ignore
  if (window.Gridia.debug instanceof RegExp && !window.Gridia.debug.test(msg.type)) return;
  // @ts-ignore
  if (window.Gridia.debugn instanceof RegExp && window.Gridia.debugn.test(msg.type)) return;

  const json = JSON.stringify(msg.data.args);
  const prefixColor = prefix === '<-' ? 'darkblue' : 'darkgreen';
  const args = [
    `%c${prefix}`,
    `background: ${prefixColor}; color: white`,
    msg.data.type,
  ];
  if (json.length > 60) {
    args.push(msg.data.args);
  } else {
    args.push(json);
  }
  console.log(...args);
}

export abstract class Connection {
  protected _onEvent?: (event: Event) => void;

  private nextId = 1;
  private idToCallback = new Map<number, Function>();

  setOnEvent(onEvent?: (event: Event) => void) {
    this._onEvent = onEvent;
  }

  sendCommand<T extends Command>(command: T) {
    const id = this.nextId++;
    const promise = new Promise<T['args']['response']>((resolve) => {
      this.idToCallback.set(id, resolve);
    });
    this.send_({
      id,
      data: command,
    });
    return promise;
  }

  protected resolveCommand(id: number, data: any) {
    const cb = this.idToCallback.get(id);
    if (!cb) throw new Error('unknown id ' + id);

    this.idToCallback.delete(id);
    cb(data);
  }

  public abstract close(): void;

  protected abstract send_(message: { id: number; data: Command }): void;
}

export class WebSocketConnection extends Connection {
  constructor(private _ws: WebSocket) {
    super();
    _ws.addEventListener('message', (e) => {
      const message = WireSerializer.deserialize<Message>(e.data);

      if (message.id) {
        this.resolveCommand(message.id, message.data);
        return;
      }

      if (!this._onEvent) return;

      debug('<-', message);
      this._onEvent(message.data);
    });

    _ws.addEventListener('close', this.onClose);
  }

  send_(message: { id: number; data: Command }) {
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
      if (this._onEvent && !message.id) this._onEvent(message.data);
    };
  }

  send_(message: { id: number; data: Command }) {
    debug('->', message);
    this._worker.postMessage(WireSerializer.serialize(message));
  }

  close() {
    delete this._worker.onmessage;
  }
}
