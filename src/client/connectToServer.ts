import { ClientWorldContext } from '../context';
import mapgen from '../mapgen';
import { ServerToClientProtocol } from '../protocol';
import ClientConnection from '../server/clientConnection';
import Server from '../server/server';
import { ServerWorldContext } from '../server/serverWorldContext';
import Client from './client';

export async function connect(client: Client, port: number): Promise<ClientToServerWire> {
  const verbose = true;

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${window.location.hostname}:${port}`);

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

  ws.addEventListener('close', () => {
    window.document.body.innerText = 'Lost connection to server. Please refresh.';
  });

  return wire;
}

interface OpenAndConnectToServerInMemoryOpts {
  dummyDelay: number;
  verbose: boolean;
  world?: ServerWorldContext;
}
export function openAndConnectToServerInMemory(client: Client, { dummyDelay, verbose, world }: OpenAndConnectToServerInMemoryOpts) {
  function maybeDelay(fn: Function) {
    if (dummyDelay > 0) {
      setTimeout(fn, dummyDelay);
    } else {
      fn();
    }
  }

  const server = new Server({ verbose });
  server.world = world ? world : mapgen(100, 100, 2, false);

  const clientConnection = new ClientConnection();
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

  return { clientToServerWire: wire, server };
}
