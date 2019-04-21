import Client from './client';
import { ClientWorldContext, ServerWorldContext } from './context';
import { getMetaItemByName } from './items';
import { ClientToServerProtocol, ServerToClientProtocol } from './protocol';

// TODO document how the f this works.

export default class Server {
  public world = new ServerWorldContext();
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

  public nextCreatureId = 1;

  public nextContainerId = 1;

  public tick() {
    for (const clientConnection of this.clientConnections) {
      // only read one message from a client at a time
      const message = clientConnection.getMessage();
      if (message) {
        console.log('from client', message.type, message.args);
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

  public consumeAllMessages() {
    while (this.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      this.tick();
    }
  }
  public makeCreature(pos: Point): Creature {
    const container = this.makeContainer();
    container.items[0] = { type: getMetaItemByName('Wood Axe').id, quantity: 1 };
    container.items[1] = { type: getMetaItemByName('Fire Starter').id, quantity: 1 };

    const creature = {
      id: this.nextCreatureId++,
      containerId: container.id,
      image: 10,
      pos,
    };
    this.world.setCreature(creature);
    return creature;
  }
  public makeContainer() {
    const container: Container = {
      id: this.nextContainerId++,
      items: Array(10).fill(null),
    };
    this.world.containers.set(container.id, container);
    return container;
  }

  public getContainer(id: number) {
    return this.world.containers.get(id);
  }

  public findNearest(loc: Point, range: number, includeTargetLocation: boolean, predicate: (tile: Tile) => boolean): Point {
    const test = (l: Point) => {
      if (!this.world.inBounds(l)) return false;
      return predicate(this.world.getTile(l));
    };

    const x0 = loc.x;
    const y0 = loc.y;
    for (let offset = includeTargetLocation ? 0 : 1; offset <= range; offset++) {
      for (let y1 = y0 - offset; y1 <= offset + y0; y1++) {
        if (y1 === y0 - offset || y1 === y0 + offset) {
          for (let x1 = x0 - offset; x1 <= offset + x0; x1++) {
            if (test({ x: x1, y: y1 })) {
              return { x: x1, y: y1 };
            }
          }
        } else {
          if (test({ x: x0 - offset, y: y1 })) {
            return { x: x0 - offset, y: y1 };
          }
          if (test({ x: x0 + offset, y: y1 })) {
            return { x: x0 + offset, y: y1 };
          }
        }
      }
    }

    return null;
  }

  public addItemNear(loc: Point, item: Item) {
    const nearestLoc = this.findNearest(loc, 6, true, (tile) => !tile.item || tile.item.type === item.type);
    if (!nearestLoc) return; // TODO what to do in this case?
    const tile = this.world.getTile(nearestLoc);
    if (tile.item) {
      tile.item.quantity += item.quantity;
    } else {
      tile.item = item;
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

interface OpenAndConnectToServerInMemoryOpts {
  dummyDelay: number;
}
export function openAndConnectToServerInMemory(client: Client, { dummyDelay }: OpenAndConnectToServerInMemoryOpts = { dummyDelay: 0 }) {
  const server = new Server();

  const messageQueue = [];
  const wire: ClientToServerWire = {
    send(type, args) {
      // const p = ServerToClientProtocol[type]
      if (dummyDelay) {
        setTimeout(() => {
          messageQueue.push({
            type,
            args,
          });
        }, dummyDelay);
      } else {
        messageQueue.push({
          type,
          args,
        });
      }
    },
    receive(type, args) {
      console.log('from server', type, args);
      const p = ServerToClientProtocol[type];
      // @ts-ignore
      p(client, args);
    },
  };
  client.world = new ClientWorldContext(wire);

  const creature = server.makeCreature({ x: 5, y: 7 });

  // make a playground of items to use
  const itemUsesGroupedByTool = new Map<number, ItemUse[]>();
  for (const use of require('../world/content/itemuses.json') as ItemUse[]) {
    let arr = itemUsesGroupedByTool.get(use.tool);
    if (!arr) {
      itemUsesGroupedByTool.set(use.tool, arr = []);
    }
    arr.push(use);
  }
  let i = 0;
  for (const [tool, uses] of Array.from(itemUsesGroupedByTool.entries()).sort(([_, a], [__, b]) => {
    return b.length - a.length;
  }).slice(0, 30)) {
    const startX = 25;
    const y = i * 3;
    server.world.getTile({ x: startX, y }).item = { type: tool, quantity: 1 };
    const focusItems = [...new Set(uses.map((u) => u.focus))];
    for (let j = 0; j < focusItems.length; j++) {
      server.world.getTile({ x: startX + j + 2, y }).item = { type: focusItems[j], quantity: 1 };
    }
    i++;
  }

  const clientConnection: ClientConnection = {
    creature,
    getMessage() {
      if (messageQueue.length) {
        return messageQueue.shift();
      }
    },
    hasMessage() {
      return messageQueue.length > 0;
    },
    send(type, args) {
      // dummy delay
      setTimeout(() => {
        wire.receive(type, args);
      }, 20);
    },
  };
  server.clientConnections.push(clientConnection);

  clientConnection.send('setCreature', creature);
  clientConnection.send('initialize', {
    creatureId: creature.id,
  });
  clientConnection.send('container', server.getContainer(creature.containerId));

  setInterval(() => {
    server.tick();
  }, 50);

  return { clientToServerWire: wire, server };
}
