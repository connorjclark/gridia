import { SECTOR_SIZE } from '../constants';
import * as Content from '../content';
import { findPath } from '../path-finding';
import performance from '../performance';
import Player from '../player';
import ClientToServerProtocol from '../protocol/client-to-server-protocol';
import * as ProtocolBuilder from '../protocol/server-to-client-protocol-builder';
import { maxDiff, randInt, worldToSector } from '../utils';
import WorldMapPartition from '../world-map-partition';
import ClientConnection from './client-connection';
import { ServerContext } from './server-context';

// TODO document how the f this works.

interface CtorOpts {
  context: ServerContext;
  verbose: boolean;
}

interface RegisterOpts {
  player: Player;
  // password: string;
}

export default class Server {
  public context: ServerContext;
  public clientConnections: ClientConnection[] = [];
  public outboundMessages = [] as Array<{
    message: ServerToClientMessage,
    to?: ClientConnection,
    filter?: (client: ClientConnection) => boolean,
  }>;
  // @ts-ignore: this is always defined when accessed.
  public currentClientConnection: ClientConnection;
  // State that clients don't need and shouldn't have.
  // Also isn't serialized - this state is transient.
  public creatureStates: Record<number, {
    creature: Creature;
    lastMove: number;
    // True if last movement was a warp. Prevents infinite stairs.
    warped: boolean;
    home: TilePoint;
    path: PartitionPoint[] | null;
  }> = {};
  public players = new Map<number, Player>();

  public verbose: boolean;

  // RPGWO does 20 second intervals.
  private growRate = 20 * 1000;
  private nextGrowthAt = performance.now() + this.growRate;

  private ticks = 0;

  private perf = {
    ticks: [] as Array<{started: number, duration: number}>,
    tickDurationAverage: 0,
    tickDurationMax: 0,
  };

  private _clientToServerProtocol = new ClientToServerProtocol();

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
  }

  public reply(message: ServerToClientMessage) {
    this.outboundMessages.push({to: this.currentClientConnection, message});
  }

  public broadcast(message: ServerToClientMessage) {
    this.outboundMessages.push({message});
  }

  public send(message: ServerToClientMessage, toClient: ClientConnection) {
    this.outboundMessages.push({to: toClient, message});
  }

  public conditionalBroadcast(message: ServerToClientMessage, filter: (client: ClientConnection) => boolean) {
    this.outboundMessages.push({filter, message});
  }

  public async tick() {
    try {
      await this.tickImpl();
    } catch (err) {
      console.error(err);
    }
  }

  public async save() {
    for (const clientConnection of this.clientConnections) {
      if (clientConnection.player) {
        await this.context.savePlayer(clientConnection.player);
      }
    }
    await this.context.save();
  }

  public async registerPlayer(clientConnection: ClientConnection, opts: RegisterOpts) {
    const {player} = opts;

    const pos = {w: 0, x: randInt(0, 10), y: randInt(0, 10), z: 0};

    // Make sure sector is loaded. Prevents hidden creature (race condition, happens often in worker).
    await this.ensureSectorLoadedForPoint(pos);

    player.id = this.context.nextPlayerId++;
    player.creature = this.registerCreature({
      id: this.context.nextCreatureId++,
      name: player.name,
      pos,
      image: randInt(0, 10),
      isPlayer: true,
    });

    // Mock xp for now.
    for (const skill of Content.getSkills()) {
      player.skills.set(skill.id, 1);
    }

    clientConnection.container = this.context.makeContainer();
    clientConnection.container.items[0] = { type: Content.getMetaItemByName('Wood Axe').id, quantity: 1 };
    clientConnection.container.items[1] = { type: Content.getMetaItemByName('Fire Starter').id, quantity: 1 };
    clientConnection.container.items[2] = { type: Content.getMetaItemByName('Pick').id, quantity: 1 };
    clientConnection.container.items[3] = { type: Content.getMetaItemByName('Plough').id, quantity: 1 };
    clientConnection.container.items[4] = { type: Content.getMetaItemByName('Mana Plant Seeds').id, quantity: 100 };
    clientConnection.container.items[5] = { type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1 };

    this.players.set(player.id, player);
    clientConnection.player = player;
    // Don't bother waiting.
    this.context.savePlayer(clientConnection.player);
    await this.initClient(clientConnection);
  }

  public removeClient(clientConnection: ClientConnection) {
    this.clientConnections.splice(this.clientConnections.indexOf(clientConnection), 1);
    if (clientConnection.player) {
      this.removeCreature(clientConnection.player.creature);
      this.broadcast(ProtocolBuilder.animation({
        ...clientConnection.player.creature.pos,
        key: 'WarpOut',
      }));
    }
  }

  public async consumeAllMessages() {
    while (this.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      await this.tick();
    }
  }

  public makeCreatureFromTemplate(creatureType: number, pos: TilePoint) {
    const template = Content.getMonsterTemplate(creatureType);
    if (!template) return; // TODO

    const creature = {
      id: this.context.nextCreatureId++,
      image: template.image,
      name: template.name,
      pos,
      isPlayer: false,
    };

    this.registerCreature(creature);
    return creature;
  }

  public registerCreature(creature: Creature): Creature {
    this.creatureStates[creature.id] = {
      creature,
      lastMove: performance.now(),
      warped: false,
      home: creature.pos,
      path: null,
    };
    this.context.setCreature(creature);
    return creature;
  }

  public moveCreature(creature: Creature, pos: TilePoint | null) {
    delete this.context.map.getTile(creature.pos).creature;
    if (pos) {
      creature.pos = pos;
      this.context.map.getTile(creature.pos).creature = creature;
    }
    this.broadcastPartialCreatureUpdate(creature, ['pos']);
    this.creatureStates[creature.id].warped = false;
  }

  public broadcastPartialCreatureUpdate(creature: Creature, keys: Array<keyof Creature>) {
    const partialCreature = {
      id: creature.id,
    };
    for (const key of keys) {
      partialCreature[key] = creature[key];
    }
    this.broadcast(ProtocolBuilder.setCreature({
      partial: true,
      ...partialCreature,
    }));
  }

  public async warpCreature(creature: Creature, pos: TilePoint | null) {
    if (pos) await this.ensureSectorLoadedForPoint(pos);
    this.moveCreature(creature, pos);
    this.creatureStates[creature.id].warped = true;
    this.creatureStates[creature.id].path = null;
  }

  public removeCreature(creature: Creature) {
    delete this.context.map.getTile(creature.pos).creature;
    this.context.creatures.delete(creature.id);
    if (this.creatureStates[creature.id]) {
      delete this.creatureStates[creature.id];
    }
    this.broadcast(ProtocolBuilder.removeCreature({
      id: creature.id,
    }));
  }

  public findNearest(loc: TilePoint, range: number, includeTargetLocation: boolean,
                     predicate: (tile: Tile) => boolean): TilePoint | null {
    const w = loc.w;
    const partition = this.context.map.getPartition(w);
    const test = (l: PartitionPoint) => {
      if (!partition.inBounds(l)) return false;
      return predicate(partition.getTile(l));
    };

    const x0 = loc.x;
    const y0 = loc.y;
    const z = loc.z;
    for (let offset = includeTargetLocation ? 0 : 1; offset <= range; offset++) {
      for (let y1 = y0 - offset; y1 <= offset + y0; y1++) {
        if (y1 === y0 - offset || y1 === y0 + offset) {
          for (let x1 = x0 - offset; x1 <= offset + x0; x1++) {
            if (test({ x: x1, y: y1, z })) {
              return { w, x: x1, y: y1, z };
            }
          }
        } else {
          if (test({ x: x0 - offset, y: y1, z })) {
            return { w, x: x0 - offset, y: y1, z };
          }
          if (test({ x: x0 + offset, y: y1, z })) {
            return { w, x: x0 + offset, y: y1, z };
          }
        }
      }
    }

    return null;
  }

  public addItemNear(loc: TilePoint, item: Item) {
    const nearestLoc = this.findNearest(loc, 6, true, (tile) => !tile.item || tile.item.type === item.type);
    if (!nearestLoc) return; // TODO what to do in this case?
    const nearestTile = this.context.map.getTile(nearestLoc);
    if (nearestTile.item) {
      nearestTile.item.quantity += item.quantity;
    } else {
      nearestTile.item = item;
    }

    this.broadcast(ProtocolBuilder.setItem({
      ...nearestLoc,
      source: 0,
      item: nearestTile.item,
    }));
  }

  public setFloor(loc: TilePoint, floor: number) {
    this.context.map.getTile(loc).floor = floor;
    this.broadcast(ProtocolBuilder.setFloor({
      ...loc,
      floor,
    }));
  }

  public setItem(loc: TilePoint, item?: Item) {
    this.context.map.getTile(loc).item = item;
    this.broadcast(ProtocolBuilder.setItem({
      ...loc,
      source: 0,
      item,
    }));
  }

  public setItemInContainer(id: number, index: number, item?: Item) {
    const container = this.context.containers.get(id);
    if (!container) throw new Error('no container: ' + id);

    container.items[index] = item || null;

    this.conditionalBroadcast(ProtocolBuilder.setItem({
      ...{w: 0, x: index, y: 0, z: 0},
      source: id,
      item,
    }), (clientConnection) => {
      return clientConnection.container.id === id || clientConnection.registeredContainers.includes(id);
    });
  }

  // TODO: make "item" required, and use "setItemInContainer" to set null items.
  public addItemToContainer(id: number, index?: number, item?: Item) {
    const container = this.context.containers.get(id);
    if (!container) throw new Error('no container: ' + id);

    // If index is not specified, pick one:
    // Pick the first slot of the same item type, if stackable.
    // Else, pick the first open slot.
    if (index === undefined) {
      let firstOpenSlot = null;
      let firstStackableSlot = null;
      for (let i = 0; i < container.items.length; i++) {
        if (firstOpenSlot === null && !container.items[i]) {
          firstOpenSlot = i;
        }
        const containerItem = container.items[i];
        if (item && containerItem && containerItem.type === item.type) {
          firstStackableSlot = i;
          break;
        }
      }

      if (firstStackableSlot !== null) {
        index = firstStackableSlot;
        item.quantity += container.items[firstStackableSlot].quantity;
      } else if (firstOpenSlot !== null) {
        index = firstOpenSlot;
      }
    }

    if (index !== undefined) {
      this.setItemInContainer(id, index, item);
    } else {
      // TODO don't let containers grow unbounded.
      container.items.length += 1;
      this.setItemInContainer(id, container.items.length - 1, item);
    }
  }

  public grantXp(clientConnection: ClientConnection, skill: number, xp: number) {
    const currentXp = clientConnection.player.skills.get(skill);
    const newXp = (currentXp || 0) + xp;
    clientConnection.player.skills.set(skill, newXp);

    this.send(ProtocolBuilder.xp({
      skill,
      xp,
    }), clientConnection);
  }

  public ensureSectorLoaded(sectorPoint: TilePoint) {
    return this.context.map.getPartition(sectorPoint.w).getSectorAsync(sectorPoint);
  }

  public ensureSectorLoadedForPoint(loc: TilePoint) {
    const sectorPoint = worldToSector(loc, SECTOR_SIZE);
    return this.ensureSectorLoaded({w: loc.w, ...sectorPoint});
  }

  private async initClient(clientConnection: ClientConnection) {
    const player = clientConnection.player;

    clientConnection.send(ProtocolBuilder.initialize({
      isAdmin: player.isAdmin,
      creatureId: player.creature.id,
      containerId: clientConnection.container.id,
      skills: [...player.skills.entries()],
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
    clientConnection.send(ProtocolBuilder.setCreature({partial: false, ...player.creature}));
    clientConnection.send(ProtocolBuilder.container(await this.context.getContainer(clientConnection.container.id)));
    setTimeout(() => {
      this.broadcast(ProtocolBuilder.animation({...player.creature.pos, key: 'WarpIn'}));
    }, 1000);
  }

  private async tickImpl() {
    const now = performance.now();
    this.ticks++;

    // Handle creatures.
    for (const state of Object.values(this.creatureStates)) {
      const {creature} = state;
      if (creature.isPlayer) continue;

      if (now - state.lastMove > 1500) {
        state.lastMove = now;
        const w = creature.pos.w;
        const partition = this.context.map.getPartition(w);

        // Always recalc for tamed creatures.
        if (creature.tamedBy) {
          state.path = null;
        }

        if (!state.path || state.path.length === 0) {
          let destination = null;
          const tamedBy = creature.tamedBy && this.players.get(creature.tamedBy);

          if (tamedBy) {
            destination = tamedBy.creature.pos;
          } else if (maxDiff(creature.pos, state.home) <= 10) {
            const randomDest = {...creature.pos};
            randomDest.x += Math.floor(Math.random() * 6 - 1);
            randomDest.y += Math.floor(Math.random() * 6 - 1);
            if (partition.walkable(randomDest)) {
              destination = randomDest;
            }
          } else {
            destination = state.home;
          }

          if (destination) state.path = findPath(partition, creature.pos, destination);
        }

        if (!state.path || state.path.length === 0) return;
        const newPos = { w, ...state.path.splice(0, 1)[0]};
        if (partition.walkable(newPos)) {
          this.moveCreature(creature, newPos);
        } else {
          // Path has been obstructed - reset pathing.
          state.path = null;
        }
      }
    }

    // Handle stairs and warps.
    for (const state of Object.values(this.creatureStates)) {
      const creature = state.creature;
      if (state.warped) continue;

      const map = this.context.map;
      const item = map.getItem(creature.pos);
      if (item) {
        const meta = Content.getMetaItem(item.type);

        let newPos = null;
        if (meta.class === 'CaveDown' && await map.walkableAsync({...creature.pos, z: creature.pos.z + 1})) {
          newPos = {...creature.pos, z: creature.pos.z + 1};
        } else if (meta.class === 'CaveUp' && await map.walkableAsync({...creature.pos, z: creature.pos.z - 1})) {
          newPos = {...creature.pos, z: creature.pos.z - 1};
        } else if (meta.trapEffect === 'Warp' && item.warpTo && await map.walkableAsync(item.warpTo)) {
          newPos = {...item.warpTo};
          this.broadcast(ProtocolBuilder.animation({
            ...creature.pos,
            key: 'WarpOut',
          }));
          this.broadcast(ProtocolBuilder.animation({
            ...item.warpTo,
            key: 'WarpIn',
          }));
        }

        if (newPos) {
          await this.warpCreature(creature, newPos);
        }
      }
    }

    // Handle growth.
    // TODO: Only load part of the world in memory and simulate growth of inactive areas on load.
    if (this.nextGrowthAt <= now) {
      this.nextGrowthAt += this.growRate;
      for (const [w, partition] of this.context.map.getPartitions()) {
        this.growPartition(w, partition);
      }
    }

    // Handle messages.
    for (const clientConnection of this.clientConnections) {
      // only read one message from a client at a time
      const message = clientConnection.getMessage();
      if (message) {
        if (this.verbose) console.log('from client', message.type, message.args);
        this.currentClientConnection = clientConnection;
        // performance.mark(`${message.type}-start`);
        try {
          const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
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
    }

    // TODO stream marks somewhere, and pull in isomorphic node/browser performance.
    // console.log(performance.getEntries());
    // performance.clearMarks();
    // performance.clearMeasures();
    // performance.clearResourceTimings();

    for (const {message, to, filter} of this.outboundMessages) {
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

    // const tickDuration = performance.now() - now;
    // this.perf.ticks.push({
    //   started: now,
    //   duration: tickDuration,
    // });

    // // Send clients perf stats.
    // // TODO just send to admins.
    // if (this.ticks % (20 * 10) === 0) {
    //   // ~every 10 seconds @ 50ms / tick.

    //   // Only keep the last 10 seconds of ticks.
    //   const cutoff = now - 10 * 1000;
    //   const firstValid = this.perf.ticks.findIndex((tick) => tick.started >= cutoff);
    //   this.perf.ticks.splice(0, firstValid);
    //   this.perf.tickDurationAverage =
    //     this.perf.ticks.reduce((acc, cur) => acc + cur.duration, 0) / this.perf.ticks.length;
    //   this.perf.tickDurationMax = this.perf.ticks.reduce((acc, cur) => Math.max(acc, cur.duration), 0);

    //   this.broadcast('log', {
    //     msg: JSON.stringify({
    //       ticksPerSec: this.perf.ticks.length / 10,
    //       avg: this.perf.tickDurationAverage,
    //       max: this.perf.tickDurationMax,
    //     }),
    //   });
    // }
  }

  private growPartition(w: number, partition: WorldMapPartition) {
    for (let x = 0; x < partition.width; x++) {
      for (let y = 0; y < partition.height; y++) {
        const pos = {x, y, z: 0};
        const item = partition.getItem(pos);
        if (!item) continue;
        const meta = Content.getMetaItem(item.type);
        if (!meta || !meta.growthItem) continue;

        item.growth = (item.growth || 0) + 1;
        if (item.growth >= meta.growthDelta) {
          item.type = meta.growthItem;
          item.growth = 0;
          this.broadcast(ProtocolBuilder.setItem({
            ...pos,
            w,
            source: 0,
            item,
          }));
        }
      }
    }
  }
}

// const context = new ServerProtocolContext()
// context.world = new ServerWorldContext()
// let outboundMessages = [];
// const clients: Client[] = []

// function tick() {
//   for (const client of clients) {
//     // only read one message from a client at a time
//     const message = client.getMessage()
//     if (message) {
//       console.log('from client', message.type, message.args)
//       context.client = client
//       protocol[message.type].apply(context, message.args)
//     }
//   }

//   for (const message of outboundMessages) {
//     if (message.to) {
//       message.to.send(message.type, message.args)
//     } else {
//       for (const client of clients) {
//         client.send(message.type, message.args)
//       }
//     }
//   }
//   outboundMessages = []
// }
