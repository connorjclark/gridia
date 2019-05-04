import { getMetaItem, getMetaItemByName } from '../items';
import { ClientToServerProtocol } from '../protocol';
import { maxDiff, worldToSector } from '../utils';
import ClientConnection from './clientConnection';
import { ServerWorldContext } from './serverWorldContext';

// TODO document how the f this works.

export default class Server {
  public world: ServerWorldContext;
  public clientConnections: ClientConnection[] = [];
  public outboundMessages = [];
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

  constructor({ verbose = false }) {
    this.verbose = verbose;
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
    this.clientConnections.push(clientConnection);

    clientConnection.send('initialize', {
      creatureId: clientConnection.creature.id,
      width: this.world.width,
      height: this.world.height,
      depth: this.world.depth,
    });
    clientConnection.send('setCreature', clientConnection.creature);
    clientConnection.send('container', this.getContainer(clientConnection.creature.containerId));
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
    const container = this.makeContainer();
    container.items[0] = { type: getMetaItemByName('Wood Axe').id, quantity: 1 };
    container.items[1] = { type: getMetaItemByName('Fire Starter').id, quantity: 1 };
    container.items[2] = { type: getMetaItemByName('Pick').id, quantity: 1 };
    container.items[3] = { type: getMetaItemByName('Plough').id, quantity: 1 };
    container.items[4] = { type: getMetaItemByName('Mana Plant Seeds').id, quantity: 100 };

    const creature = {
      id: this.nextCreatureId++,
      containerId: container.id,
      image,
      pos,
    };
    this.creatureStates[creature.id] = {
      creature,
      isPlayer,
      lastMove: new Date().getTime(),
      warped: false,
      home: pos,
    };
    this.world.setCreature(creature);
    return creature;
  }

  public moveCreature(creature: Creature, pos: TilePoint | null) {
    this.world.getTile(creature.pos).creature = null;
    if (pos) {
      creature.pos = pos;
      this.world.getTile(creature.pos).creature = creature;
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
    this.world.getTile(creature.pos).creature = null;
    delete this.world.creatures[creature.id];
    if (this.creatureStates[creature.id]) {
      delete this.creatureStates[creature.id];
    }
    // TODO broadcast removal.
  }

  // TODO make Container class.
  public makeContainer() {
    const container: Container = {
      id: this.nextContainerId++,
      items: Array(10).fill(null),
    };
    this.world.containers.set(container.id, container);
    return container;
  }

  public containerHasItem(id: number, itemType: number) {
    const container = this.world.containers.get(id);
    for (const item of container.items) {
      if (item && item.type === itemType) return true;
    }
    return false;
  }

  public getContainer(id: number) {
    return this.world.containers.get(id);
  }

  public findNearest(loc: TilePoint, range: number, includeTargetLocation: boolean,
                     predicate: (tile: Tile) => boolean): TilePoint {
    const test = (l: TilePoint) => {
      if (!this.world.inBounds(l)) return false;
      return predicate(this.world.getTile(l));
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
    const nearestTile = this.world.getTile(nearestLoc);
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

  private tickImpl() {
    const now = new Date().getTime();

    // Handle creatures.
    for (const state of Object.values(this.creatureStates)) {
      if (state.isPlayer) continue;
      const {creature} = state;

      if (now - state.lastMove > 3000) {
        state.lastMove = now;
        const newPos = {...creature.pos};
        newPos.x += Math.floor(Math.random() * 3 - 1);
        newPos.y += Math.floor(Math.random() * 3 - 1);
        if (this.world.walkable(newPos) && maxDiff(state.home, newPos) <= 10) {
          this.moveCreature(creature, newPos);
        }
      }
    }

    // Handle stairs.
    for (const state of Object.values(this.creatureStates)) {
      const creature = state.creature;
      if (state.warped) continue;

      const item = this.world.getItem(creature.pos);
      if (item) {
        const meta = getMetaItem(item.type);

        let newPos = null;
        if (meta.class === 'Cave_down' && this.world.walkable({...creature.pos, z: creature.pos.z + 1})) {
          newPos = {...creature.pos, z: creature.pos.z + 1};
        } else if (meta.class === 'Cave_up' && this.world.walkable({...creature.pos, z: creature.pos.z - 1})) {
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
      for (let x = 0; x < this.world.width; x++) {
        for (let y = 0; y < this.world.height; y++) {
          const pos = {x, y, z: 0};
          const item = this.world.getItem(pos);
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
      } else {
        for (const clientConnection of this.clientConnections) {
          clientConnection.send(message.type, message.args);
        }
      }
    }
    this.outboundMessages = [];
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
