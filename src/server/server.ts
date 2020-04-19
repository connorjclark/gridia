import { SECTOR_SIZE } from '../constants';
import * as Content from '../content';
import { findPath } from '../path-finding';
import performance from '../performance';
import Player from '../player';
import ClientToServerProtocol from '../protocol/client-to-server-protocol';
import * as ProtocolBuilder from '../protocol/server-to-client-protocol-builder';
import * as Utils from '../utils';
import WorldMapPartition from '../world-map-partition';
import ClientConnection from './client-connection';
import { ServerContext } from './server-context';

// TODO document how the f this works.

interface CtorOpts {
  context: ServerContext;
  verbose: boolean;
}

interface RegisterOpts {
  name: string;
  // password: string;
}

// State that clients don't need and shouldn't have.
// Also isn't serialized - this state is transient.
class CreatureState {
  public mode: string[] = [];
  public nextMovement = 0;
  // True if last movement was a warp. Prevents infinite stairs.
  public warped = false;
  public home: TilePoint;
  public path: PartitionPoint[] = [];

  // For attacking.
  public targetCreature: CreatureState | null = null;
  public nextAttack = 0;

  public enemyCreatures: CreatureState[] = [];

  constructor(public creature: Creature) {
    this.home = creature.pos;
  }

  public pop() {
    if (this.mode.length) this.mode.pop();
  }

  public goto(partition: WorldMapPartition, destination: TilePoint) {
    if (Utils.equalPoints(destination, this.creature.pos)) return;
    if (destination.w !== this.creature.pos.w) return;
    this.path = findPath(partition, this.creature.pos, destination);
  }

  public tick(server: Server, now: number) {
    this._handleMovement(server, now);
    this._handleAttack(server, now);
  }

  public respondToCreatureRemoval(creature: Creature) {
    if (this.targetCreature?.creature === creature) {
      this.targetCreature = null;
    }

    const index = this.enemyCreatures.findIndex((enemy) => enemy.creature === creature);
    if (index !== -1) this.enemyCreatures.splice(index, 1);
  }

  private _handleMovement(server: Server, now: number) {
    if (this.creature.isPlayer) return;
    if (now < this.nextMovement) return;
    const duration = [400, 750, 1000, 1500, 3500, 5000][Utils.clamp(this.creature.speed, 0, 5)];
    this.nextMovement = now + duration;

    const w = this.creature.pos.w;
    const partition = server.context.map.getPartition(w);

    // Target the closest enemy.
    if (this.enemyCreatures.length && !this.targetCreature) {
      let closestEnemy: CreatureState | null = null;
      let closestDist = Number.MAX_VALUE;
      for (const enemy of this.enemyCreatures) {
        if (!enemy) continue;
        if (enemy.creature.pos.w !== w) continue;

        const dist = Utils.dist(enemy.creature.pos, this.creature.pos);
        if (!closestEnemy || closestDist > dist) {
          closestEnemy = enemy;
          closestDist = dist;
        }
      }

      if (closestEnemy) {
        this.targetCreature = closestEnemy;
        this.path = [];
      }
    }

    if (this.path.length) {
      const newPos = { w, ...this.path.splice(0, 1)[0] };
      if (partition.walkable(newPos)) {
        server.moveCreature(this.creature, newPos);
      } else {
        // Path has been obstructed - reset pathing.
        this.path = [];
      }
    }

    const mode = this.mode.length ? this.mode[this.mode.length - 1] : 'idle';
    if (mode === 'idle') {
      const tamedBy = this.creature.tamedBy && server.players.get(this.creature.tamedBy);
      if (tamedBy) {
        // Always recalc for tamed creatures.
        this.goto(partition, tamedBy.creature.pos);
      } else if (this.targetCreature) {
        this.goto(partition, this.targetCreature.creature.pos);
      } else if (this.path.length === 0 && this.creature.roam) {
        const randomDest = { ...this.home };
        randomDest.x += Utils.randInt(-this.creature.roam, this.creature.roam);
        randomDest.y += Utils.randInt(-this.creature.roam, this.creature.roam);
        if (partition.walkable(randomDest)) this.goto(partition, randomDest);
      }
    } else {
      this.pop();
    }
  }

  private _handleAttack(server: Server, now: number) {
    if (!this.targetCreature || now < this.nextAttack) return;
    this.nextAttack = now + 1000;

    if (!this.targetCreature.enemyCreatures.includes(this)) {
      this.targetCreature.enemyCreatures.push(this);
    }
    server.modifyCreatureLife(this.creature, this.targetCreature.creature, -10);
  }
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
  public creatureStates: Record<number, CreatureState> = {};
  public players = new Map<number, Player>();

  public verbose: boolean;

  // RPGWO does 20 second intervals.
  private growRate = 20 * 1000;
  private nextGrowthAt = performance.now() + this.growRate;

  private ticks = 0;

  private perf = {
    ticks: [] as Array<{ started: number, duration: number }>,
    tickDurationAverage: 0,
    tickDurationMax: 0,
  };

  private _clientToServerProtocol = new ClientToServerProtocol();

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
  }

  public reply(message: ServerToClientMessage) {
    this.outboundMessages.push({ to: this.currentClientConnection, message });
  }

  public broadcast(message: ServerToClientMessage) {
    this.outboundMessages.push({ message });
  }

  public send(message: ServerToClientMessage, toClient: ClientConnection) {
    this.outboundMessages.push({ to: toClient, message });
  }

  public conditionalBroadcast(message: ServerToClientMessage, filter: (client: ClientConnection) => boolean) {
    this.outboundMessages.push({ filter, message });
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
    const { width, height } = this.context.map.getPartition(0);
    const pos = {
      w: 0,
      x: Utils.randInt(width / 2 - 10, width / 2 + 10),
      y: Utils.randInt(height / 2 - 10, height / 2 + 10),
      z: 0,
    };

    // Make sure sector is loaded. Prevents hidden creature (race condition, happens often in worker).
    await this.ensureSectorLoadedForPoint(pos);

    const creature = this.registerCreature({
      id: this.context.nextCreatureId++,
      name: opts.name,
      pos,
      image: Utils.randInt(0, 10),
      isPlayer: true,
      speed: 2,
      life: 1000,
    });

    const player = new Player(creature);
    player.name = opts.name;
    player.isAdmin = true; // everyone is an admin, for now.

    player.id = this.context.nextPlayerId++;
    player.creature = creature;

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
    clientConnection.container.items[6] = { type: Content.getMetaItemByName('Saw').id, quantity: 1 };
    clientConnection.container.items[7] = { type: Content.getMetaItemByName('Hammer and Nails').id, quantity: 1 };

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

  public makeCreatureFromTemplate(creatureType: number | Monster, pos: TilePoint) {
    const template = typeof creatureType === 'number' ? Content.getMonsterTemplate(creatureType) : creatureType;
    if (!template) return; // TODO

    const creature = {
      id: this.context.nextCreatureId++,
      image: template.image,
      name: template.name,
      pos,
      isPlayer: false,
      roam: template.roam,
      speed: template.speed,
      life: template.life,
    };

    this.registerCreature(creature);
    return creature;
  }

  public registerCreature(creature: Creature): Creature {
    this.creatureStates[creature.id] = new CreatureState(creature);
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

  public async warpCreature(creature: Creature, pos: TilePoint | null) {
    if (pos && !this.context.map.inBounds(pos)) return;

    if (pos) await this.ensureSectorLoadedForPoint(pos);
    this.moveCreature(creature, pos);
    this.creatureStates[creature.id].warped = true;
    this.creatureStates[creature.id].path = [];
  }

  public modifyCreatureLife(actor: Creature, creature: Creature, delta: number) {
    creature.life += delta;

    if (delta < 0) {
      this.broadcast(ProtocolBuilder.animation({
        ...creature.pos,
        key: 'Attack',
      }));
    }

    if (creature.life <= 0) {
      this.removeCreature(creature);
      this.broadcast(ProtocolBuilder.animation({
        ...creature.pos,
        key: 'diescream',
      }));
    }
  }

  public removeCreature(creature: Creature) {
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
      location: Utils.ItemLocation.World(nearestLoc),
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
      location: Utils.ItemLocation.World(loc),
      item,
    }));
  }

  public setItemInContainer(id: number, index: number, item?: Item) {
    const container = this.context.containers.get(id);
    if (!container) throw new Error('no container: ' + id);

    container.items[index] = item || null;

    this.conditionalBroadcast(ProtocolBuilder.setItem({
      location: Utils.ItemLocation.Container(id, index),
      item,
    }), (clientConnection) => {
      return clientConnection.container.id === id || clientConnection.registeredContainers.includes(id);
    });
  }

  public addItemToContainer(id: number, index: number | undefined, item: Item) {
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
        if (containerItem && containerItem.type === item.type) {
          firstStackableSlot = i;
          break;
        }
      }

      if (firstStackableSlot !== null) {
        index = firstStackableSlot;
        // @ts-ignore: verified to exist
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
    const sectorPoint = Utils.worldToSector(loc, SECTOR_SIZE);
    return this.ensureSectorLoaded({ w: loc.w, ...sectorPoint });
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
    clientConnection.send(ProtocolBuilder.setCreature({ partial: false, ...player.creature }));
    clientConnection.send(ProtocolBuilder.container(await this.context.getContainer(clientConnection.container.id)));
    setTimeout(() => {
      this.broadcast(ProtocolBuilder.animation({ ...player.creature.pos, key: 'WarpIn' }));
    }, 1000);
  }

  private async tickImpl() {
    const now = performance.now();
    this.ticks++;

    // Handle creatures.
    for (const state of Object.values(this.creatureStates)) {
      state.tick(this, now);
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

        await this.warpCreature(creature, newPos);
        if (playWarpSound) {
          this.broadcast(ProtocolBuilder.animation({
            ...creature.pos,
            key: 'WarpOut',
          }));
          this.broadcast(ProtocolBuilder.animation({
            ...newPos,
            key: 'WarpIn',
          }));
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
          // @ts-ignore
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
        const pos = { x, y, z: 0 };
        const item = partition.getItem(pos);
        if (!item) continue;
        const meta = Content.getMetaItem(item.type);
        if (!meta || !meta.growthItem) continue;

        item.growth = (item.growth || 0) + 1;
        if (item.growth >= meta.growthDelta) {
          item.type = meta.growthItem;
          item.growth = 0;
          this.broadcast(ProtocolBuilder.setItem({
            location: Utils.ItemLocation.World({ ...pos, w }),
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
