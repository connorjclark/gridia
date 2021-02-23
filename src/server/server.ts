import { SECTOR_SIZE } from '../constants';
import * as Content from '../content';
import performance from '../performance';
import Player from '../player';
import ClientToServerProtocol from '../protocol/client-to-server-protocol';
import * as ProtocolBuilder from '../protocol/server-to-client-protocol-builder';
import * as Utils from '../utils';
import WorldMapPartition from '../world-map-partition';
import { WorldTime } from '../world-time';
import ClientConnection from './client-connection';
import CreatureState from './creature-state';
import { ServerContext } from './server-context';
import TaskRunner from './task-runner';

// TODO document how the f this works.

interface CtorOpts {
  context: ServerContext;
  verbose: boolean;
}

interface RegisterOpts {
  name: string;
  password: string;
}

export default class Server {
  context: ServerContext;
  clientConnections: ClientConnection[] = [];
  outboundMessages = [] as Array<{
    message: ServerToClientMessage;
    to?: ClientConnection;
    filter?: (client: ClientConnection) => boolean;
  }>;
  // @ts-ignore: this is always defined when accessed.
  currentClientConnection: ClientConnection;
  creatureStates: Record<number, CreatureState> = {};
  players = new Map<number, Player>();
  verbose: boolean;
  taskRunner = new TaskRunner(50);

  secondsPerWorldTick = 20;
  ticksPerWorldDay = 24 * 60 * 60 / this.secondsPerWorldTick / 8;
  time = new WorldTime(this.ticksPerWorldDay, this.ticksPerWorldDay / 2);
  private _clientToServerProtocol = new ClientToServerProtocol();

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
    this.setupTickSections();
  }

  reply(message: ServerToClientMessage) {
    this.outboundMessages.push({ to: this.currentClientConnection, message });
  }

  broadcast(message: ServerToClientMessage) {
    this.outboundMessages.push({ message });
  }

  send(message: ServerToClientMessage, toClient: ClientConnection) {
    this.outboundMessages.push({ to: toClient, message });
  }

  conditionalBroadcast(message: ServerToClientMessage, filter: (client: ClientConnection) => boolean) {
    this.outboundMessages.push({ filter, message });
  }

  broadcastInRange(message: ServerToClientMessage, loc: TilePoint, range: number) {
    this.conditionalBroadcast(message, (client) => {
      const loc2 = client.player.creature.pos;
      if (loc2.z !== loc.z || loc2.w !== loc.w) return false;

      return Utils.dist(loc, loc2) <= range;
    });
  }

  broadcastAnimation(pos: TilePoint, name: string) {
    this.broadcastInRange(ProtocolBuilder.animation({ ...pos, key: name }), pos, 30);
  }

  start() {
    this.taskRunner.start();
  }

  stop() {
    this.taskRunner.stop();
  }

  async tick() {
    await this.taskRunner.tick();
  }

  async save() {
    for (const clientConnection of this.clientConnections) {
      if (clientConnection.player) {
        await this.context.savePlayer(clientConnection.player);
      }
    }
    await this.context.save();
  }

  async registerPlayer(clientConnection: ClientConnection, opts: RegisterOpts) {
    const { width, height } = this.context.map.getPartition(0);

    const center = { w: 0, x: Math.round(width / 2), y: Math.round(height / 2) + 3, z: 0 };
    // Make sure sector is loaded. Prevents hidden creature (race condition, happens often in worker).
    await this.ensureSectorLoadedForPoint(center);
    const spawnLoc = this.findNearest(center, 10, true, (_, loc) => this.context.map.walkable(loc)) || center;
    await this.ensureSectorLoadedForPoint(spawnLoc);

    const creature = {
      // Set later.
      id: 0,
      name: opts.name,
      pos: spawnLoc,
      image: Utils.randInt(0, 10),
      isPlayer: true,
      speed: 2,
      life: 1000,
      food: 100,
      eat_grass: false,
      light: 0,
    };

    const player = new Player(creature);
    player.name = opts.name;
    player.isAdmin = true; // everyone is an admin, for now.

    player.id = this.context.nextPlayerId++;
    player.creature = creature;

    // Mock xp for now.
    for (const skill of Content.getSkills()) {
      player.skills.set(skill.id, 1);
    }

    const container = this.context.makeContainer();
    player.containerId = container.id;
    if (opts.name !== 'test-user') {
      container.items[0] = { type: Content.getMetaItemByName('Wood Axe').id, quantity: 1 };
      container.items[1] = { type: Content.getMetaItemByName('Fire Starter').id, quantity: 1 };
      container.items[2] = { type: Content.getMetaItemByName('Pick').id, quantity: 1 };
      container.items[3] = { type: Content.getMetaItemByName('Plough').id, quantity: 1 };
      container.items[4] = { type: Content.getMetaItemByName('Mana Plant Seeds').id, quantity: 100 };
      container.items[5] = { type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1 };
      container.items[6] = { type: Content.getMetaItemByName('Saw').id, quantity: 1 };
      container.items[7] = { type: Content.getMetaItemByName('Hammer and Nails').id, quantity: 1 };
      container.items[8] = { type: Content.getMetaItemByName('Lit Torch').id, quantity: 1 };
    }

    // Don't bother waiting.
    this.context.savePlayerPassword(clientConnection.player, opts.password);
    this.context.savePlayer(clientConnection.player);

    this.context.playerNamesToIds.set(opts.name, player.id);
    await this.loginPlayer(clientConnection, opts);
  }

  async loginPlayer(clientConnection: ClientConnection, opts: { name: string; password: string }) {
    const playerId = this.context.playerNamesToIds.get(opts.name);
    if (!playerId) throw new Error('invalid player name');

    const player = await this.context.loadPlayer(playerId);

    player.creature = this.registerCreature(player.creature);
    clientConnection.container = await this.context.getContainer(player.containerId);

    this.players.set(player.id, player);
    clientConnection.player = player;
    await this.initClient(clientConnection);
  }

  removeClient(clientConnection: ClientConnection) {
    this.clientConnections.splice(this.clientConnections.indexOf(clientConnection), 1);
    if (clientConnection.player) {
      this.removeCreature(clientConnection.player.creature);
      this.broadcastAnimation(clientConnection.player.creature.pos, 'WarpOut');
    }
  }

  async consumeAllMessages() {
    while (this.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      await this.tick();
    }
  }

  makeCreatureFromTemplate(creatureType: number | Monster, pos: TilePoint) {
    const template = typeof creatureType === 'number' ? Content.getMonsterTemplate(creatureType) : creatureType;
    if (!template) return; // TODO

    const creature = {
      id: this.context.nextCreatureId++,
      image: template.image,
      image_type: template.image_type,
      name: template.name,
      pos,
      isPlayer: false,
      roam: template.roam,
      speed: template.speed,
      life: template.life,
      food: 10,
      eat_grass: template.eat_grass,
      light: 0,
    };

    this.registerCreature(creature);
    return creature;
  }

  registerCreature(creature: Creature): Creature {
    this.creatureStates[creature.id] = new CreatureState(creature);
    this.context.setCreature(creature);
    this.broadcast(ProtocolBuilder.setCreature({ partial: false, ...creature }));
    return creature;
  }

  moveCreature(creature: Creature, pos: TilePoint | null) {
    delete this.context.map.getTile(creature.pos).creature;
    if (pos) {
      creature.pos = pos;
      this.context.map.getTile(creature.pos).creature = creature;
    }
    this.broadcastPartialCreatureUpdate(creature, ['pos']);
    this.creatureStates[creature.id].warped = false;
  }

  broadcastPartialCreatureUpdate(creature: Creature, keys: Array<keyof Creature>) {
    const partialCreature: Partial<Creature> = {
      id: creature.id,
    };
    for (const key of keys) {
      // @ts-ignore
      partialCreature[key] = creature[key];
    }
    this.broadcast(ProtocolBuilder.setCreature({
      partial: true,
      ...partialCreature,
    }));
  }

  async warpCreature(creature: Creature, pos: TilePoint | null) {
    if (pos && !this.context.map.inBounds(pos)) return;

    if (pos) await this.ensureSectorLoadedForPoint(pos);
    this.moveCreature(creature, pos);
    this.creatureStates[creature.id].warped = true;
    this.creatureStates[creature.id].path = [];
  }

  modifyCreatureLife(actor: Creature | null, creature: Creature, delta: number) {
    creature.life += delta;

    this.broadcast(ProtocolBuilder.setCreature({ partial: true, id: creature.id, life: creature.life }));

    if (delta < 0) {
      this.broadcastAnimation(creature.pos, 'Attack');
    }

    if (creature.life <= 0) {
      this.removeCreature(creature);
      this.broadcastAnimation(creature.pos, 'diescream');
    }
  }

  removeCreature(creature: Creature) {
    delete this.context.map.getTile(creature.pos).creature;
    this.context.creatures.delete(creature.id);

    const creatureState = this.creatureStates[creature.id];
    if (creatureState) {
      for (const state of Object.values(this.creatureStates)) {
        state.respondToCreatureRemoval(creature);
      }
      delete this.creatureStates[creature.id];
    }

    this.broadcast(ProtocolBuilder.removeCreature({
      id: creature.id,
    }));
  }

  findNearest(loc: TilePoint, range: number, includeTargetLocation: boolean,
              predicate: (tile: Tile, loc2: TilePoint) => boolean): TilePoint | null {
    const w = loc.w;
    const partition = this.context.map.getPartition(w);
    const test = (l: TilePoint) => {
      if (!partition.inBounds(l)) return false;
      return predicate(partition.getTile(l), l);
    };

    const x0 = loc.x;
    const y0 = loc.y;
    const z = loc.z;
    for (let offset = includeTargetLocation ? 0 : 1; offset <= range; offset++) {
      for (let y1 = y0 - offset; y1 <= offset + y0; y1++) {
        if (y1 === y0 - offset || y1 === y0 + offset) {
          for (let x1 = x0 - offset; x1 <= offset + x0; x1++) {
            if (test({ w, x: x1, y: y1, z })) {
              return { w, x: x1, y: y1, z };
            }
          }
        } else {
          if (test({ w, x: x0 - offset, y: y1, z })) {
            return { w, x: x0 - offset, y: y1, z };
          }
          if (test({ w, x: x0 + offset, y: y1, z })) {
            return { w, x: x0 + offset, y: y1, z };
          }
        }
      }
    }

    return null;
  }

  addItemNear(loc: TilePoint, item: Item) {
    const nearestLoc = this.findNearest(loc, 6, true, (tile) => !tile.item || tile.item.type === item.type);
    if (!nearestLoc) return; // TODO what to do in this case?

    const nearestTile = this.context.map.getTile(nearestLoc);
    if (nearestTile.item) {
      nearestTile.item.quantity += item.quantity;
    } else {
      nearestTile.item = item;
    }

    this.broadcast(ProtocolBuilder.setItem({
      location: Utils.ItemLocation.World(nearestLoc),
      item: nearestTile.item,
    }));
  }

  setFloor(loc: TilePoint, floor: number) {
    this.context.map.getTile(loc).floor = floor;
    this.broadcast(ProtocolBuilder.setFloor({
      ...loc,
      floor,
    }));
  }

  setItem(loc: TilePoint, item?: Item) {
    this.context.map.getTile(loc).item = item;
    this.broadcast(ProtocolBuilder.setItem({
      location: Utils.ItemLocation.World(loc),
      item,
    }));
  }

  updateCreatureLight(client: ClientConnection) {
    const light = client.container.items.reduce((acc, cur) => {
      if (!cur) return acc;
      return Math.max(acc, Content.getMetaItem(cur.type).light);
    }, 0);
    if (light === client.player.creature.light) return;

    client.player.creature.light = light;
    this.broadcastPartialCreatureUpdate(client.player.creature, ['light']);
  }

  setItemInContainer(id: number, index: number, item?: Item) {
    const container = this.context.containers.get(id);
    if (!container) throw new Error(`no container: ${id}`);

    const prevItem = container.items[index];
    container.items[index] = item || null;

    this.conditionalBroadcast(ProtocolBuilder.setItem({
      location: Utils.ItemLocation.Container(id, index),
      item,
    }), (clientConnection) =>
      clientConnection.container.id === id || clientConnection.registeredContainers.includes(id));

    // TODO: should light sources be equippable and only set creature light then?
    if ((prevItem && Content.getMetaItem(prevItem.type).light) || (item && Content.getMetaItem(item.type).light)) {
      const client = this.clientConnections.find((c) => c.container.id === id);
      if (!client) return;

      this.updateCreatureLight(client);
    }
  }

  // TODO: move these functions to Container class.
  isValidLocationToAddItemInContainer(id: number, index: number, item: Item): boolean {
    const container = this.context.containers.get(id);
    if (!container) throw new Error(`no container: ${id}`);

    const isStackable = Content.getMetaItem(item.type).stackable;

    if (!container.items[index]) return true;
    if (!isStackable) return false;
    // TODO: check stack limit.
    return container.items[index]?.type === item.type;
  }

  findValidLocationToAddItemToContainer(
    id: number, item: Item, opts: { allowStacking: boolean }): ContainerLocation | undefined {
    const container = this.context.containers.get(id);
    if (!container) throw new Error(`no container: ${id}`);

    const isStackable = opts.allowStacking && Content.getMetaItem(item.type).stackable;

    // Pick the first slot of the same item type, if stackable.
    // Else, pick the first open slot.
    let firstOpenSlot = null;
    let firstStackableSlot = null;
    for (let i = 0; i < container.items.length; i++) {
      if (firstOpenSlot === null && !container.items[i]) {
        firstOpenSlot = i;
      }
      const containerItem = container.items[i];
      if (isStackable && containerItem && containerItem.type === item.type) {
        firstStackableSlot = i;
        break;
      }
    }

    let index;
    if (firstStackableSlot !== null) {
      index = firstStackableSlot;
    } else if (firstOpenSlot !== null) {
      index = firstOpenSlot;
    }

    if (index !== undefined) {
      return Utils.ItemLocation.Container(id, index);
    }
  }

  grantXp(clientConnection: ClientConnection, skill: number, xp: number) {
    const currentXp = clientConnection.player.skills.get(skill);
    const newXp = (currentXp || 0) + xp;
    clientConnection.player.skills.set(skill, newXp);

    this.send(ProtocolBuilder.xp({
      skill,
      xp,
    }), clientConnection);
  }

  ensureSectorLoaded(sectorPoint: TilePoint) {
    return this.context.map.getPartition(sectorPoint.w).getSectorAsync(sectorPoint);
  }

  ensureSectorLoadedForPoint(loc: TilePoint) {
    const sectorPoint = Utils.worldToSector(loc, SECTOR_SIZE);
    return this.ensureSectorLoaded({ w: loc.w, ...sectorPoint });
  }

  advanceTime(ticks: number) {
    // const ticks = gameHours * (this.ticksPerWorldDay / 24);
    this.time.epoch += ticks;
    this.broadcast(ProtocolBuilder.time({ epoch: this.time.epoch }));

    // TODO
    // for (let i = 0; i < ticks; i++) {
    //   for (const [w, partition] of this.context.map.getPartitions()) {
    //     Array.from(this.growPartition(w, partition));
    //   }
    // }
  }

  getMessageTime() {
    return `The time is ${this.time.toString()}`;
  }

  getMessagePlayersOnline() {
    const players = [...this.players.values()].map((player) => player.name);
    return `${players.length} players online: ${players.join(', ')}`;
  }

  private async initClient(clientConnection: ClientConnection) {
    const player = clientConnection.player;

    clientConnection.send(ProtocolBuilder.initialize({
      player,
      secondsPerWorldTick: this.secondsPerWorldTick,
      ticksPerWorldDay: this.ticksPerWorldDay,
    }));
    clientConnection.send(ProtocolBuilder.time({ epoch: this.time.epoch }));

    clientConnection.send(ProtocolBuilder.chat({
      from: 'World',
      to: '', // TODO
      message: [
        `Welcome to Gridia, ${player.name}! Type "/help" for a list of chat commands`,
        this.getMessagePlayersOnline(),
        this.getMessageTime(),
      ].join('\n'),
    }));

    // TODO need much better loading.
    for (const [w, partition] of this.context.map.getPartitions()) {
      clientConnection.send(ProtocolBuilder.initializePartition({
        w,
        x: partition.width,
        y: partition.height,
        z: partition.depth,
      }));
    }
    // TODO: remove this line since "register creature" does the same. but removing breaks tests ...
    clientConnection.send(ProtocolBuilder.setCreature({ partial: false, ...player.creature }));
    clientConnection.send(ProtocolBuilder.container(await this.context.getContainer(clientConnection.container.id)));
    this.updateCreatureLight(clientConnection);
    setTimeout(() => {
      this.broadcastAnimation(player.creature.pos, 'WarpIn');
    }, 1000);
  }

  private setupTickSections() {
    // Handle creatures.
    this.taskRunner.registerTickSection({
      description: 'creature states',
      fn: () => {
        for (const state of Object.values(this.creatureStates)) {
          state.tick(this);
        }
      },
    });

    // Handle stairs and warps.
    this.taskRunner.registerTickSection({
      description: 'stairs and warps',
      fn: async () => {
        for (const state of Object.values(this.creatureStates)) {
          const creature = state.creature;
          if (state.warped) continue;

          const map = this.context.map;
          const item = map.getItem(creature.pos);
          if (item) {
            const meta = Content.getMetaItem(item.type);

            let newPos = null;
            let playWarpSound = false;
            if (meta.class === 'CaveDown') {
              newPos = { ...creature.pos, z: creature.pos.z + 1 };
            } else if (meta.class === 'CaveUp') {
              newPos = { ...creature.pos, z: creature.pos.z - 1 };
            } else if (meta.trapEffect === 'Warp' && item.warpTo) {
              newPos = { ...item.warpTo };
              playWarpSound = true;
            }
            if (!newPos || !map.inBounds(newPos) || !await map.walkableAsync(newPos)) continue;

            if (playWarpSound) {
              this.broadcastAnimation(creature.pos, 'WarpOut');
              this.broadcastAnimation(newPos, 'WarpIn');
            }
            await this.warpCreature(creature, newPos);
          }
        }
      },
    });

    // Handle time.
    // TODO: Only load part of the world in memory and simulate growth of inactive areas on load.
    const server = this;
    this.taskRunner.registerTickSection({
      description: 'time',
      // RPGWO does 20 second growth intervals.
      rate: { seconds: this.secondsPerWorldTick },
      *generator() {
        server.time.epoch += 1;

        for (const [w, partition] of server.context.map.getPartitions()) {
          yield* server.growPartition(w, partition);
        }
      },
    });

    this.taskRunner.registerTickSection({
      description: 'sync time',
      rate: { minutes: 1 },
      fn: () => {
        server.broadcast(ProtocolBuilder.time({ epoch: server.time.epoch }));
      },
    });

    // Handle time.
    // let lastTimeSync = this._epochTicks;
    // this.taskRunner.registerTickSection({
    //   description: 'day/night',
    //   rate: { minutes: 1 },
    //   fn: () => {
    //     this._time += this._realTimeToGameTimeRatio;
    //     if (this._time - lastTimeSync > 60) {
    //       this.broadcast(ProtocolBuilder.time({time: this._time}));
    //       lastTimeSync = this._time;
    //     }
    //   },
    // });

    // Handle hunger.
    this.taskRunner.registerTickSection({
      description: 'hunger',
      rate: { minutes: 1 },
      fn: () => {
        for (const creature of this.context.creatures.values()) {
          if (!creature.eat_grass) return; // TODO: let all creature experience hunger pain.

          if (creature.food <= 0) {
            // TODO: reduce stamina instead?
            this.modifyCreatureLife(null, creature, -10);
          } else {
            creature.food -= 1;
          }
        }
      },
    });

    // Handle messages.
    this.taskRunner.registerTickSection({
      description: 'messages',
      fn: async () => {
        for (const clientConnection of this.clientConnections) {
          // only read one message from a client at a time
          const message = clientConnection.getMessage();
          if (!message) continue;

          if (this.verbose) console.log('from client', message.type, message.args);
          this.currentClientConnection = clientConnection;
          // performance.mark(`${message.type}-start`);
          try {
            const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
            // @ts-ignore
            // eslint-disable-next-line
            const ret = this._clientToServerProtocol[onMethodName](this, message.args);
            // TODO: some message handlers are async ... is that bad?
            if (ret) await ret;
          } catch (err) {
            // Don't let a bad message kill the message loop.
            console.error(err, message);
          }
          // performance.mark(`${message.type}-end`);
          // performance.measure(message.type, `${message.type}-start`, `${message.type}-end`);
        }

        // TODO stream marks somewhere, and pull in isomorphic node/browser performance.
        // console.log(performance.getEntries());
        // performance.clearMarks();
        // performance.clearMeasures();
        // performance.clearResourceTimings();

        for (const { message, to, filter } of this.outboundMessages) {
          // Send a message to:
          // 1) a specific client
          // 2) clients based on a filter
          // 3) everyone (broadcast)
          if (to) {
            to.send(message);
          } else if (filter) {
            for (const clientConnection of this.clientConnections) {
              // If connection is not logged in yet, skip.
              if (!clientConnection.player) continue;
              if (filter(clientConnection)) clientConnection.send(message);
            }
          } else {
            for (const clientConnection of this.clientConnections) {
              // If connection is not logged in yet, skip.
              if (!clientConnection.player) continue;
              clientConnection.send(message);
            }
          }
        }
        this.outboundMessages = [];
      },
    });

    this.taskRunner.registerTickSection({
      description: 'tick performance',
      rate: { seconds: 10 },
      fn: () => {
        if (!this.taskRunner.debugMeasureTiming) return;

        const perf = this.taskRunner.perf;

        // Only keep the last 10 seconds of ticks.
        const cutoff = performance.now() - 10 * 1000;
        const firstValid = perf.ticks.findIndex((tick) => tick.started >= cutoff);
        perf.ticks.splice(0, firstValid);
        perf.tickDurationAverage =
          perf.ticks.reduce((acc, cur) => acc + cur.duration, 0) / perf.ticks.length;
        perf.tickDurationMax = perf.ticks.reduce((acc, cur) => Math.max(acc, cur.duration), 0);
        const lastTick = perf.ticks[perf.ticks.length - 1];
        const secondsRange = (lastTick.started + lastTick.duration - perf.ticks[0].started) / 1000;
        const ticksPerSec = perf.ticks.length / secondsRange;
        const longestTick = perf.ticks.reduce((longest, cur) => {
          if (longest.duration > cur.duration) return longest;
          return cur;
        });

        // Send clients perf stats.
        const msg = JSON.stringify({
          ticksPerSec,
          avgDurationMs: perf.tickDurationAverage,
          maxDurationMs: perf.tickDurationMax,
          longestTick,
        }, null, 2);
        this.broadcast(ProtocolBuilder.log({ msg }));
      },
    });
  }

  private *growPartition(w: number, partition: WorldMapPartition) {
    // TODO: test which is faster?
    // iterate directly, iterate with getIteratorForArea, or iterate directly on partition.sectors ?

    let i = 0;
    for (const { pos, tile } of partition.getIteratorForArea({ x: 0, y: 0, z: 0 }, partition.width, partition.height)) {
      if (++i % 1000 === 0) yield;

      if (pos.z !== 0) continue; // TODO. No reason. lol.

      if (!tile.item) continue;

      const meta = Content.getMetaItem(tile.item.type);
      if (!meta || !meta.growthItem) continue;

      tile.item.growth = (tile.item.growth || 0) + 1;
      if (tile.item.growth < meta.growthDelta) continue;

      tile.item.type = meta.growthItem;
      tile.item.growth = 0;
      this.broadcast(ProtocolBuilder.setItem({
        location: Utils.ItemLocation.World({ ...pos, w }),
        item: tile.item,
      }));
    }

    // for (let x = 0; x < partition.width; x++) {
    //   for (let y = 0; y < partition.height; y++) {
    //     const pos = { x, y, z: 0 };
    //     const item = partition.getItem(pos);
    //     if (!item) continue;
    //     const meta = Content.getMetaItem(item.type);
    //     if (!meta || !meta.growthItem) continue;

    //     item.growth = (item.growth || 0) + 1;
    //     if (item.growth >= meta.growthDelta) {
    //       item.type = meta.growthItem;
    //       item.growth = 0;
    //       this.broadcast(ProtocolBuilder.setItem({
    //         location: Utils.ItemLocation.World({ ...pos, w }),
    //         item,
    //       }));
    //     }
    //   }
    // }
  }
}
