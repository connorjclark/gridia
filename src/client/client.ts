import { Context } from '../context';
import ServerToClientProtocol from '../protocol/server-to-client-protocol';
import { Message } from '../protocol/server-to-client-protocol-builder';
import Player from '../player';
import { Connection } from './connection';
import EventEmitter from './event-emitter';
import { getDefaultSettings } from './modules/settings-module';

class Client {
  // @ts-ignore set later.
  public player: Player;

  public eventEmitter = new EventEmitter();
  public settings = getDefaultSettings();

  private _protocol = new ServerToClientProtocol();

  public constructor(public connection: Connection, public context: Context) {
    this.eventEmitter.on('message', this.handleMessageFromServer.bind(this));
  }

  public handleMessageFromServer(message: Message) {
    // if (opts.verbose) console.log('from server', message.type, message.args);
    const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
    // @ts-ignore
    const p = this._protocol[onMethodName];
    p(this, message.args);
  }

  public get creature() {
    return this.context.getCreature(this.player.creature.id);
  }

  public get inventory() {
    return this.context.containers.get(this.player.containerId);
  }
}

export default Client;
