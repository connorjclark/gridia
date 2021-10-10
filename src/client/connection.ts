import {game} from '../game-singleton.js';
import * as WireSerializer from '../lib/wire-serializer.js';
import {ProtocolCommand} from '../protocol/command-builder.js';
import {ProtocolEvent} from '../protocol/event-builder.js';

function debug(prefix: string, msg: Message) {
  // @ts-expect-error
  if (!window.Gridia.debug && !window.Gridia.debugn) return;
  // @ts-expect-error
  if (window.Gridia.debug instanceof RegExp && !window.Gridia.debug.test(msg.type)) return;
  // @ts-expect-error
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
    msg.data?.type || '(response)',
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
      this.idToCallback.set(id, {resolve, reject});
    });
    this.send_({
      id,
      data: command,
    });
    // @ts-expect-error
    return promise;
  }

  protected resolveCommand(id: number, data: any) {
    const cbs = this.idToCallback.get(id);
    if (!cbs) throw new Error('unknown id ' + id);

    this.idToCallback.delete(id);
    if (data && data.error) {
      cbs.reject(data.error);
      if (game) game.addToChat('World', data.error);
    } else {
      cbs.resolve(data);
    }
  }

  public abstract close(): void;

  protected abstract send_(message: { id: number; data: ProtocolCommand }): void;
}

export class WebRTCConnection extends Connection {
  private _bestEffortChannel: RTCDataChannel;
  private _guarenteedChannel: RTCDataChannel;
  private _connectionstatechangeListener: any;

  constructor(private _peerConnection: RTCPeerConnection, private _channels: RTCDataChannel[]) {
    super();

    // @ts-expect-error
    this._bestEffortChannel = _channels.find((c) => c.label === 'best-effort');
    // @ts-expect-error
    this._guarenteedChannel = _channels.find((c) => c.label === 'guarenteed');
    if (!this._bestEffortChannel) throw new Error('missing channel');
    if (!this._guarenteedChannel) throw new Error('missing channel');

    for (const channel of _channels) {
      channel.addEventListener('message', (e) => {
        const message = WireSerializer.deserialize<Message>(e.data);
        debug('<-', message);

        if (message.id) {
          this.resolveCommand(message.id, message.data);
          return;
        }

        if (this._onEvent) this._onEvent(message.data);
      });
    }

    this._connectionstatechangeListener = () => {
      if (_peerConnection.connectionState === 'disconnected' || _peerConnection.connectionState === 'failed') {
        this.onClose();
      }
    };
    _peerConnection.addEventListener('connectionstatechange', this._connectionstatechangeListener);
  }

  send_(message: { id: number; data: ProtocolCommand }) {
    debug('->', message);
    this._guarenteedChannel.send(WireSerializer.serialize(message));
  }

  close() {
    this._peerConnection.removeEventListener('connectionstatechange', this._connectionstatechangeListener);
    this._peerConnection.close();
    this.onClose();
  }

  private onClose() {
    game?.onDisconnect();
  }
}

export class WebSocketConnection extends Connection {
  constructor(public hostname: string, public port: number, private _ws: WebSocket) {
    super();
    _ws.addEventListener('message', (e) => {
      if (e.data.rpc) return;

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
    this.onClose();
  }

  private onClose() {
    game?.onDisconnect();
  }
}

export class WorkerConnection extends Connection {
  constructor(private _worker: Worker) {
    super();

    this.onMessage = this.onMessage.bind(this);
    this._worker.addEventListener('message', this.onMessage);
  }

  onMessage(e: MessageEvent) {
    if (e.data.rpc) return;

    const message = WireSerializer.deserialize<Message>(e.data);
    debug('<-', message);

    if (message.id) {
      this.resolveCommand(message.id, message.data);
      return;
    }

    if (this._onEvent) this._onEvent(message.data);
  }

  send_(message: { id: number; data: ProtocolCommand }) {
    debug('->', message);
    this._worker.postMessage(WireSerializer.serialize(message));
  }

  close() {
    this._worker.removeEventListener('message', this.onMessage);
  }
}
