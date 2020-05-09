import { Context } from '../context';
import ServerToClientProtocol from '../protocol/server-to-client-protocol';
import { Message } from '../protocol/server-to-client-protocol-builder';
import { Connection } from './connection';
import EventEmitter from './event-emitter';

interface Settings {
  volume: number;
}

class Client {
  public isAdmin = false;
  public creatureId = 0;
  public clientFocusPosition: Point4 = {w: 0, x: 0, y: 0, z: 0};

  public containerId = 0;
  public eventEmitter = new EventEmitter();
  public settings: Settings = {
    volume: process.env.NODE_ENV === 'production' ? 0.6 : 0,
  };
  // skill id -> xp
  public skills = new Map<number, number>();

  private _protocol = new ServerToClientProtocol();

  constructor(public connection: Connection, public context: Context) {
    this.eventEmitter.on('message', this.handleMessageFromServer.bind(this));
  }

  public handleMessageFromServer(message: Message) {
    // if (opts.verbose) console.log('from server', message.type, message.args);
    const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
    // @ts-ignore
    const p = this._protocol[onMethodName];
    p(this, message.args);
  }

  get creature() {
    return this.context.getCreature(this.creatureId);
  }

  get inventory() {
    return this.context.containers.get(this.containerId);
  }
}

export default Client;
