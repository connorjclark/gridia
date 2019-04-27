import { getMetaItem, getMetaItemByName } from '../items';
import { ClientToServerProtocol } from '../protocol';
import ClientConnection from './clientConnection';
import { ServerWorldContext } from './serverWorldContext';

// TODO document how the f this works.

export default class Server {
  public world: ServerWorldContext;
  public clientConnections: ClientConnection[] = [];
  public outboundMessages = [];
  public currentClientConnection: ClientConnection;

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

  constructor({ verbose = false }) {
    this.verbose = verbose;
  }

  public tick() {
    // Handle stairs.
    for (const clientConnection of Object.values(this.clientConnections)) {
      if (clientConnection.warped) continue;

      const creature = clientConnection.creature;
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
          this.moveCreature(creature, newPos);
          clientConnection.warped = true;
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

  public addClient(clientConnection: ClientConnection) {
    clientConnection.creature = this.makeCreature({ x: 5, y: 7, z: 0 });
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

  public consumeAllMessages() {
    while (this.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      this.tick();
    }
  }

  public makeCreature(pos: TilePoint): Creature {
    const container = this.makeContainer();
    container.items[0] = { type: getMetaItemByName('Wood Axe').id, quantity: 1 };
    container.items[1] = { type: getMetaItemByName('Fire Starter').id, quantity: 1 };
    container.items[2] = { type: getMetaItemByName('Pick').id, quantity: 1 };

    const creature = {
      id: this.nextCreatureId++,
      containerId: container.id,
      image: 10,
      pos,
    };
    this.world.setCreature(creature);
    return creature;
  }

  public moveCreature(creature: Creature, pos: TilePoint) {
    this.world.getTile(creature.pos).creature = null;
    creature.pos = pos;
    this.world.getTile(creature.pos).creature = creature;
    this.broadcast('setCreature', {
      id: creature.id,
      pos: creature.pos,
    });
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

  public findNearest(loc: TilePoint, range: number, includeTargetLocation: boolean, predicate: (tile: Tile) => boolean): TilePoint {
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
    const tile = this.world.getTile(nearestLoc);
    if (tile.item) {
      tile.item.quantity += item.quantity;
    } else {
      tile.item = item;
    }

    this.broadcast('setItem', {
      ...nearestLoc,
      source: 0,
      item: tile.item,
    });
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
