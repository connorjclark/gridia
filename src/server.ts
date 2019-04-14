import { ClientToServerProtocol, ServerToClientProtocol } from './protocol'
import { ServerWorldContext, ClientWorldContext } from "./context";
import { Client } from './main';

// TODO document how the f this works.

export default class Server {
  world = new ServerWorldContext;
  clientConnections: ClientConnection[] = [];
  outboundMessages = [];
  currentClientConnection: ClientConnection;

  tick() {
    for (const clientConnection of this.clientConnections) {
      // only read one message from a client at a time
      const message = clientConnection.getMessage()
      if (message) {
        console.log('from client', message.type, message.args)
        // context.client = client
        this.currentClientConnection = clientConnection;
        ClientToServerProtocol[message.type](this, message.args)
      }
    }

    for (const message of this.outboundMessages) {
      if (message.to) {
        message.to.send(message.type, message.args)
      } else {
        for (const clientConnection of this.clientConnections) {
          clientConnection.send(message.type, message.args)
        }
      }
    }
    this.outboundMessages = []
  }

  reply = ((type, args) => {
    this.outboundMessages.push({
      to: this.currentClientConnection,
      type,
      args,
    });
  }) as ServerToClientWire['send'];

  nextCreatureId = 1
  makeCreature(pos: Point): Creature {
    const creature = {
      id: this.nextCreatureId++,
      containerId: this.makeContainer().id,
      image: 10,
      pos,
    }
    this.world.setCreature(creature)
    return creature
  }

  nextContainerId = 1;
  makeContainer() {
    const container: Container = {
      id: this.nextContainerId++,
      items: Array(10).fill(null),
    };
    container.items[0] = { type: 50, quantity: 1 };
    this.world.containers.set(container.id, container);
    return container;
  }

  getContainer(id: number) {
    return this.world.containers.get(id);
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



export function openAndConnectToServerInMemory(client: Client) {
  const server = new Server();

  function makeWire(client, messageQueue): ClientToServerWire {
    return {
      send(type, args) {
        // const p = ServerToClientProtocol[type]
        // dummy delay
        setTimeout(() => {
          messageQueue.push({
            type,
            args,
          })
        }, 20)
      },
      receive(type, args) {
        console.log('from server', type, args)
        const p = ServerToClientProtocol[type]
        // @ts-ignore
        p(client, args)
      },
    }
  }

  const messageQueue = []
  const wire = makeWire(client, messageQueue)
  client.world = new ClientWorldContext(wire)

  const creature = server.makeCreature({ x: 5, y: 5 })

  const clientConnection: ClientConnection = {
    creature,
    getMessage() {
      if (messageQueue.length) {
        return messageQueue.shift()
      }
    },
    send(type, args) {
      // dummy delay
      setTimeout(() => {
        wire.receive(type, args)
      }, 20)
    },
  }
  server.clientConnections.push(clientConnection)

  clientConnection.send('setCreature', creature);
  // clientConnection.send('initialize', creature);
  clientConnection.send('initialize', {
    creatureId: creature.id,
  });
  clientConnection.send('container', server.getContainer(creature.containerId));

  setInterval(() => {
    server.tick();
  }, 50)

  return wire
}