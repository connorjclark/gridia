import {Context} from '../context.js';
import {game} from '../game-singleton.js';
import {ClientInterface} from '../protocol/client-interface.js';
import {ProtocolEvent} from '../protocol/event-builder.js';

import {Connection} from './connection.js';
import {TypedEventEmitter} from './event-emitter.js';
import {Settings} from './modules/settings-module.js';

export class Client {
  // @ts-ignore set later.
  player: Player;
  creatureId = 0;
  attackingCreatureId: number | null = 0;

  secondsPerWorldTick = 0;
  ticksPerWorldDay = 0;

  eventEmitter = new TypedEventEmitter();
  // @ts-ignore set later.
  settings: Settings = {};
  storedEvents: ProtocolEvent[] = [];

  private _protocol = new ClientInterface();

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

  // TODO remove undefined from return type
  get inventory() {
    return this.context.containers.get(this.player.containerId);
  }

  get equipment() {
    return this.context.containers.get(this.player.equipmentContainerId);
  }
}
