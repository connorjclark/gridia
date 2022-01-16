import {Context} from '../context.js';
import {game} from '../game-singleton.js';
import {ClientInterface} from '../protocol/client-interface.js';
import * as CommandBuilder from '../protocol/command-builder.js';
import {ProtocolEvent} from '../protocol/event-builder.js';
import {WorldMapPartition} from '../world-map-partition.js';
import {WorldTime} from '../world-time.js';

import {Connection} from './connection.js';
import {TypedEventEmitter} from './event-emitter.js';

export class Client {
  // @ts-expect-error set later.
  player: Player;
  // @ts-expect-error set later.
  account: GridiaAccount;
  // @ts-expect-error set later.
  settings: Settings = {};

  creatureId = 0;
  attackingCreatureId: number | null = 0;

  // TODO: mark private
  _lastSyncedEpoch = 0;
  _lastSyncedRealTime = 0;

  eventEmitter = new TypedEventEmitter();
  storedEvents: ProtocolEvent[] = [];

  private _protocol = new ClientInterface();
  firebaseToken?: string;

  private requestedPartitionPromises = new Map<number, Promise<WorldMapPartition>>();

  constructor(private connection_: Connection, public context: Context) {
    this.eventEmitter.on('event', this.handleEventFromServer.bind(this));
    this.connection = connection_;
  }

  get connection() {
    return this.connection_;
  }

  set connection(connection: Connection) {
    this.connection_ = connection;
    connection.setOnEvent((event) => this.eventEmitter.emit('event', event));
  }

  handleEventFromServer(event: ProtocolEvent) {
    if (!game || !game.started) {
      this.storedEvents.push(event);
    }

    // if (opts.verbose) console.log('from server', event.type, event.args);
    const onMethodName = 'on' + event.type[0].toUpperCase() + event.type.substr(1);
    // @ts-expect-error
    const p = this._protocol[onMethodName];
    p(this, event.args);
  }

  getOrRequestPartition(w: number) {
    const partition = game.client.context.map.partitions.get(w);
    if (partition) return {partition, promise: null};

    let promise = this.requestedPartitionPromises.get(w);
    if (!promise) {
      promise = new Promise(async (resolve) => {
        const response = await this.connection.sendCommand(CommandBuilder.requestPartition({w}));
        this.context.map.initPartition(response.name, response.w, response.x, response.y, response.z);
        const newPartition = game.client.context.map.partitions.get(w);
        if (!newPartition) throw new Error('unexpected');

        resolve(newPartition);
      });
      this.requestedPartitionPromises.set(w, promise);
    }

    return {
      partition: null,
      promise,
    };
  }

  get worldTime() {
    const realSecondsSinceLastSync = (Date.now() - this._lastSyncedRealTime) / 1000;
    const epoch = this._lastSyncedEpoch + realSecondsSinceLastSync / this.context.secondsPerWorldTick;
    // return new WorldTime(this.client.ticksPerWorldDay, epoch).time; // TODO ?
    return new WorldTime(this.context.ticksPerWorldDay, epoch);
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
