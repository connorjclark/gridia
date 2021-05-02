import { Context } from '../context';
import ServerToClientProtocol from '../protocol/client-interface';
import { ProtocolEvent } from '../protocol/event-builder';
import { game } from '../game-singleton';
import { Connection } from './connection';
import EventEmitter from './event-emitter';
import { Settings } from './modules/settings-module';

class Client {
  // @ts-ignore set later.
  player: Player;
  creatureId = 0;
  attackingCreatureId: number | null = 0;

  secondsPerWorldTick = 0;
  ticksPerWorldDay = 0;

  eventEmitter = new EventEmitter();
  // @ts-ignore set later.
  settings: Settings = {};
  storedEvents: ProtocolEvent[] = [];

  private _protocol = new ServerToClientProtocol();

  constructor(public connection: Connection, public context: Context) {
    this.eventEmitter.on('event', this.handleEventFromServer.bind(this));
  }

  handleEventFromServer(event: ProtocolEvent) {
    if (!game || !game.started) {
      this.storedEvents.push(event);
    }

    // if (opts.verbose) console.log('from server', event.type, event.args);
    const onMethodName = 'on' + event.type[0].toUpperCase() + event.type.substr(1);
    // @ts-ignore
    const p = this._protocol[onMethodName];
    p(this, event.args);
  }

  get creature() {
    return this.context.getCreature(this.creatureId);
  }

  get inventory() {
    return this.context.containers.get(this.player.containerId);
  }

  get equipment() {
    return this.context.containers.get(this.player.equipmentContainerId);
  }
}

export default Client;
