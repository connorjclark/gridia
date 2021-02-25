import { Context } from '../context';
import ServerToClientProtocol from '../protocol/server-to-client-protocol';
import { Message } from '../protocol/server-to-client-protocol-builder';
import Player from '../player';
import { Connection } from './connection';
import EventEmitter from './event-emitter';
import { Settings } from './modules/settings-module';

class Client {
  // @ts-ignore set later.
  player: Player;

  secondsPerWorldTick = 0;
  ticksPerWorldDay = 0;

  eventEmitter = new EventEmitter();
  // @ts-ignore set later.
  settings: Settings = {};

  private _protocol = new ServerToClientProtocol();

  constructor(public connection: Connection, public context: Context) {
    this.eventEmitter.on('message', this.handleMessageFromServer.bind(this));
  }

  handleMessageFromServer(message: Message) {
    // if (opts.verbose) console.log('from server', message.type, message.args);
    const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
    // @ts-ignore
    const p = this._protocol[onMethodName];
    p(this, message.args);
  }

  get creature() {
    return this.context.getCreature(this.player.creature.id);
  }

  get inventory() {
    return this.context.containers.get(this.player.containerId);
  }

  get equipment() {
    return this.context.containers.get(this.player.equipmentContainerId);
  }
}

export default Client;
