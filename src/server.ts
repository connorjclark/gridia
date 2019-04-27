import {Server as WebSocketServer} from 'ws';
import Client from './client';
import { ClientWorldContext, ServerWorldContext } from './context';
import { getMetaItemByName } from './items';
import mapgen from './mapgen';
import { ClientToServerProtocol, ServerToClientProtocol } from './protocol';

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
    this.clientConnections.push(clientConnection);

    clientConnection.send('initialize', {
      creatureId: clientConnection.creature.id,
      width: this.world.width,
      height: this.world.height,
    });
    clientConnection.send('setCreature', clientConnection.creature);
    clientConnection.send('container', this.getContainer(clientConnection.creature.containerId));
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

    this.broadcast('setItem', {
      ...nearestLoc,
      source: 0,
      item: tile.item,
    });
  }
}

class ClientConnection {
  public messageQueue: any[] = [];

  public creature: Creature;

  public send: WireMethod<typeof import('./protocol')['ServerToClientProtocol']>;

  public getMessage(): any {
    return this.messageQueue.shift();
  }

  public hasMessage(): boolean {
    return this.messageQueue.length > 0;
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
  verbose: boolean;
}
export async function openAndConnectToServerInMemory(client: Client, { dummyDelay, verbose }: OpenAndConnectToServerInMemoryOpts) {
  function maybeDelay(fn: Function) {
    if (dummyDelay > 0) {
      setTimeout(fn, dummyDelay);
    } else {
      fn();
    }
  }

  const server = new Server({ verbose });
  server.world = mapgen(100, 100, 1);

  const creature = server.makeCreature({ x: 5, y: 7 });

  const clientConnection = new ClientConnection();
  clientConnection.creature = creature;
  clientConnection.send = function(type, args) {
    maybeDelay(() => {
      wire.receive(type, args);
    });
  };

  const wire: ClientToServerWire = {
    send(type, args) {
      // const p = ServerToClientProtocol[type]
      maybeDelay(() => {
        clientConnection.messageQueue.push({
          type,
          args,
        });
      });
    },
    receive(type, args) {
      if (verbose) console.log('from server', type, args);
      const p = ServerToClientProtocol[type];
      // @ts-ignore
      p(client, args);
    },
  };
  client.world = new ClientWorldContext(wire);

  server.addClient(clientConnection);

  setInterval(() => {
    server.tick();
  }, 50);

  return { clientToServerWire: wire, server };
}

export function startServer(port: number) {
  const verbose = true;

  const server = new Server({
    verbose,
  });
  server.world = mapgen(100, 100, 1);

  const wss = new WebSocketServer({
    port,
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      if (verbose) console.log('got', JSON.parse(data.toString('utf-8')));
      clientConnection.messageQueue.push(JSON.parse(data.toString('utf-8')));
    });

    const creature = server.makeCreature({ x: 5, y: 7 });
    const clientConnection = new ClientConnection();
    clientConnection.creature = creature;
    clientConnection.send = function(type, args) {
      ws.send(JSON.stringify({type, args}));
    };

    server.addClient(clientConnection);
  });

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(() => {
    server.world.saveAll();
  }, 1000 * 60 * 5);

  return server;
}

export async function connect(client: Client, port: number): Promise<ClientToServerWire> {
  const verbose = true;

  const ws = new WebSocket('ws://localhost:' + port);

  const wire: ClientToServerWire = {
    send(type, args) {
      ws.send(JSON.stringify({
        type,
        args,
      }));
    },
    receive(type, args) {
      if (verbose) console.log('from server', type, args);
      const p = ServerToClientProtocol[type];
      // @ts-ignore
      p(client, args);
    },
  };
  client.world = new ClientWorldContext(wire);

  ws.addEventListener('message', (e) => {
    const parsed = JSON.parse(e.data);
    wire.receive(parsed.type, parsed.args);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('close', reject);
  });

  return wire;
}
