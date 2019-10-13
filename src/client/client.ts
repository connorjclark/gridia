import { Context } from '../context';
import ServerToClientProtocol from '../protocol/server-to-client-protocol';
import { Message } from '../protocol/server-to-client-protocol-builder';
import { Connection } from './connection';
import EventEmitter from './event-emitter';

interface Settings {
  volume: number;
}

class Client {
  public connection: Connection;
  public isAdmin: boolean;
  // TODO: keep references instead?
  public creatureId: number;
  public containerId: number;
  public context: Context;
  public eventEmitter = new EventEmitter();
  public settings: Settings = {
    volume: process.env.NODE_ENV === 'production' ? 0.6 : 0,
  };
  // skill id -> xp
  public skills = new Map<number, number>();

  private _protocol = new ServerToClientProtocol();

  constructor() {
    this.eventEmitter.on('message', this.handleMessageFromServer.bind(this));
  }

  public handleMessageFromServer(message: Message) {
    // if (opts.verbose) console.log('from server', message.type, message.args);
    const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
    const p = this._protocol[onMethodName];
    // @ts-ignore
    p(this, message.args);
  }
}

export default Client;
