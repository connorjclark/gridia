import { ClientWorldContext } from '../context';
import mapgen from '../mapgen';
import { ServerToClientProtocol } from '../protocol';
import ClientConnection from '../server/clientConnection';
import Server from '../server/server';
import Client from './client';

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
