import Container from '../container';
import { getMetaItem, getMetaItemByName } from '../items';
import performance from '../performance';
import { ClientToServerProtocol } from '../protocol';
import { maxDiff, worldToSector } from '../utils';
import ClientConnection from './clientConnection';
import { ServerContext } from './serverWorldContext';

// TODO document how the f this works.
interface CtorOpts {
  context: ServerContext;
  verbose: boolean;
}

export default class Server {
  public context: ServerContext;
  public clientConnections: ClientConnection[] = [];
  public outboundMessages = [] as Array<{
    type: keyof typeof import('../protocol')['ServerToClientProtocol'],
    args: any,
    to?: ClientConnection,
    filter?: (client: ClientConnection) => boolean,
  }>;
  public currentClientConnection: ClientConnection;
  public creatureStates: Record<number, {
    creature: Creature;
    isPlayer: boolean;
    lastMove: number;
    // True if last movement was a warp. Prevents infinite stairs.
    warped: boolean;
    home: TilePoint;
  }> = {};

  public reply = ((type, args) => {
    this.outboundMessages.push({
      to: this.currentClientConnection,
      type,
      args,
    });
  }) as ServerToClientWire['send'];

  public broadcast = ((type, args) => {
    this.outboundMessages.push({
      type,
      args,
    });
  }) as ServerToClientWire['send'];

  public nextCreatureId = 1;

  public nextContainerId = 1;

  public verbose: boolean;

  // RPGWO does 20 second intervals.
  private growRate = 20 * 1000;
  private nextGrowthAt = new Date().getTime() + this.growRate;

  private ticks = 0;

  private perf = {
    ticks: [] as Array<{started: number, duration: number}>,
    tickDurationAverage: 0,
    tickDurationMax: 0,
  };

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
  }

  public conditionalBroadcast(filter: (client: ClientConnection) => boolean): ServerToClientWire['send'] {
    return (type, args) => this.outboundMessages.push({type, args, filter});
  }

  public tick() {
    try {
      this.tickImpl();
    } catch (err) {
      console.error(err);
    }
  }

  public addClient(clientConnection: ClientConnection) {
    clientConnection.creature = this.makeCreature({ x: 5, y: 7, z: 0 }, 10, true);

    clientConnection.container = this.makeContainer();
    clientConnection.container.items[0] = { type: getMetaItemByName('Wood Axe').id, quantity: 1 };
    clientConnection.container.items[1] = { type: getMetaItemByName('Fire Starter').id, quantity: 1 };
    clientConnection.container.items[2] = { type: getMetaItemByName('Pick').id, quantity: 1 };
    clientConnection.container.items[3] = { type: getMetaItemByName('Plough').id, quantity: 1 };
    clientConnection.container.items[4] = { type: getMetaItemByName('Mana Plant Seeds').id, quantity: 100 };

    clientConnection.send('initialize', {
      creatureId: clientConnection.creature.id,
      containerId: clientConnection.container.id,
      width: this.context.map.width,
      height: this.context.map.height,
      depth: this.context.map.depth,
    });
    clientConnection.send('setCreature', clientConnection.creature);
    clientConnection.send('container', this.getContainer(clientConnection.container.id));

    this.clientConnections.push(clientConnection);
  }

  public removeClient(clientConnection: ClientConnection) {
    this.clientConnections.splice(this.clientConnections.indexOf(clientConnection), 1);
    this.moveCreature(clientConnection.creature, null);
  }

  public consumeAllMessages() {
    while (this.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      this.tick();
    }
  }

  public makeCreature(pos: TilePoint, image: number, isPlayer: boolean): Creature {
    const creature = {
      id: this.nextCreatureId++,
      image,
      pos,
    };
    this.creatureStates[creature.id] = {
      creature,
      isPlayer,
      lastMove: performance.now(),
      warped: false,
      home: pos,
    };
    this.context.setCreature(creature);
    return creature;
  }

  public moveCreature(creature: Creature, pos: TilePoint | null) {
    this.context.map.getTile(creature.pos).creature = null;
    if (pos) {
      creature.pos = pos;
      this.context.map.getTile(creature.pos).creature = creature;
    }
    this.broadcast('setCreature', {
      id: creature.id,
      pos,
      image: creature.image,
    });
    this.creatureStates[creature.id].warped = false;
  }

  public warpCreature(creature: Creature, pos: TilePoint | null) {
    this.moveCreature(creature, pos);
    this.creatureStates[creature.id].warped = true;
  }

  public removeCreature(creature: Creature) {
    this.context.map.getTile(creature.pos).creature = null;
    delete this.context.creatures[creature.id];
    if (this.creatureStates[creature.id]) {
      delete this.creatureStates[creature.id];
    }
    // TODO broadcast removal.
  }

  public makeContainer() {
    const container = new Container(this.nextContainerId++, Array(10).fill(null));
    this.context.containers.set(container.id, container);
    return container;
  }

  public getContainer(id: number) {
    return this.context.containers.get(id);
  }

  public findNearest(loc: TilePoint, range: number, includeTargetLocation: boolean,
                     predicate: (tile: Tile) => boolean): TilePoint {
    const test = (l: TilePoint) => {
      if (!this.context.map.inBounds(l)) return false;
      return predicate(this.context.map.getTile(l));
    };

    const x0 = loc.x;
    const y0 = loc.y;
    const z = loc.z;
    for (let offset = includeTargetLocation ? 0 : 1; offset <= range; offset++) {
      for (let y1 = y0 - offset; y1 <= offset + y0; y1++) {
        if (y1 === y0 - offset || y1 === y0 + offset) {
          for (let x1 = x0 - offset; x1 <= offset + x0; x1++) {
            if (test({ x: x1, y: y1, z })) {
              return { x: x1, y: y1, z };
            }
          }
        } else {
          if (test({ x: x0 - offset, y: y1, z })) {
            return { x: x0 - offset, y: y1, z };
          }
          if (test({ x: x0 + offset, y: y1, z })) {
            return { x: x0 + offset, y: y1, z };
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

    this.broadcast('setItem', {
      ...nearestLoc,
      source: 0,
      item: nearestTile.item,
    });
  }

  public setItem(loc: TilePoint, item: Item) {
    this.context.map.getTile(loc).item = item;
    this.broadcast('setItem', {
      ...loc,
      source: 0,
      item,
    });
  }

  public setItemInContainer(id: number, index: number, item: Item) {
    const container = this.context.containers.get(id);
    container.items[index] = item;
    this.conditionalBroadcast((clientConnection) => {
      return clientConnection.container.id === id || clientConnection.registeredContainers.includes(id);
    })('setItem', {
      ...{x: index, y: 0, z: 0},
      source: id,
      item,
    });
  }

  public addItemToContainer(id: number, item: Item, index?: number) {
    const container = this.context.containers.get(id);

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
        if (firstStackableSlot === null && container.items[i] && container.items[i].type === item.type) {
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

  private tickImpl() {
    const now = performance.now();
    this.ticks++;

    // Handle creatures.
    for (const state of Object.values(this.creatureStates)) {
      if (state.isPlayer) continue;
      const {creature} = state;

      if (now - state.lastMove > 3000) {
        state.lastMove = now;
        const newPos = {...creature.pos};
        newPos.x += Math.floor(Math.random() * 3 - 1);
        newPos.y += Math.floor(Math.random() * 3 - 1);
        if (this.context.map.walkable(newPos) && maxDiff(state.home, newPos) <= 10) {
          this.moveCreature(creature, newPos);
        }
      }
    }

    // Handle stairs.
    for (const state of Object.values(this.creatureStates)) {
      const creature = state.creature;
      if (state.warped) continue;

      const item = this.context.map.getItem(creature.pos);
      if (item) {
        const meta = getMetaItem(item.type);

        let newPos = null;
        if (meta.class === 'Cave_down' && this.context.map.walkable({...creature.pos, z: creature.pos.z + 1})) {
          newPos = {...creature.pos, z: creature.pos.z + 1};
        } else if (meta.class === 'Cave_up' && this.context.map.walkable({...creature.pos, z: creature.pos.z - 1})) {
          newPos = {...creature.pos, z: creature.pos.z - 1};
        }

        if (newPos) {
          this.warpCreature(creature, newPos);
        }
      }
    }

    // Handle growth.
    // TODO: Only load part of the world in memory and simulate growth of inactive areas on load.
    if (this.nextGrowthAt <= now) {
      this.nextGrowthAt += this.growRate;
      for (let x = 0; x < this.context.map.width; x++) {
        for (let y = 0; y < this.context.map.height; y++) {
          const pos = {x, y, z: 0};
          const item = this.context.map.getItem(pos);
          const meta = item && getMetaItem(item.type);
          if (meta && meta.growthItem) {
            item.growth = (item.growth || 0) + 1;
            if (item.growth >= meta.growthDelta) {
              item.type = meta.growthItem;
              item.growth = 0;
              this.broadcast('setItem', {
                ...pos,
                source: 0,
                item,
              });
            }
          }
        }
      }
    }

    // Handle messages.
    for (const clientConnection of this.clientConnections) {
      // only read one message from a client at a time
      const message = clientConnection.getMessage();
      if (message) {
        if (this.verbose) console.log('from client', message.type, message.args);
        this.currentClientConnection = clientConnection;
        ClientToServerProtocol[message.type](this, message.args);
      }
    }

    for (const message of this.outboundMessages) {
      if (message.to) {
        message.to.send(message.type, message.args);
      } else if (message.filter) {
        for (const clientConnection of this.clientConnections) {
          if (message.filter(clientConnection)) clientConnection.send(message.type, message.args);
        }
      } else {
        for (const clientConnection of this.clientConnections) {
          clientConnection.send(message.type, message.args);
        }
      }
    }
    this.outboundMessages = [];

    const tickDuration = performance.now() - now;
    this.perf.ticks.push({
      started: now,
      duration: tickDuration,
    });

    // Send clients perf stats.
    // TODO just send to admins.
    if (this.ticks % (20 * 10) === 0) {
      // ~every 10 seconds @ 50ms / tick.

      // Only keep the last 10 seconds of ticks.
      const cutoff = now - 10 * 1000;
      const firstValid = this.perf.ticks.findIndex((tick) => tick.started >= cutoff);
      this.perf.ticks.splice(0, firstValid);
      this.perf.tickDurationAverage =
        this.perf.ticks.reduce((acc, cur) => acc + cur.duration, 0) / this.perf.ticks.length;
      this.perf.tickDurationMax = this.perf.ticks.reduce((acc, cur) => Math.max(acc, cur.duration), 0);

      this.broadcast('log', {
        msg: JSON.stringify({
          ticksPerSec: this.perf.ticks.length / 10,
          avg: this.perf.tickDurationAverage,
          max: this.perf.tickDurationMax,
        }),
      });
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
