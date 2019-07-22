import { Context } from '../context';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import ServerToClientProtocol from '../protocol/server-to-client-protocol';
import ClientConnection from '../server/client-connection';
import WorldMap from '../world-map';
import Client from './client';

const protocol = new ServerToClientProtocol();

function createClientWorldMap(wire: ClientToServerWire) {
  const map = new WorldMap();
  map.loader = (sectorPoint) => {
    wire.send(ProtocolBuilder.requestSector(sectorPoint));
    return map.createEmptySector(); // temporary until server sends something
  };
  return map;
}

export async function connect(client: Client, port: number): Promise<ClientToServerWire> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${window.location.hostname}:${port}`);

  const wire: ClientToServerWire = {
    send(message) {
      ws.send(JSON.stringify(message));
    },
    receive(message) {
      // @ts-ignore
      if (window.Gridia.verbose) console.log('from server', message.type, message.args);
      const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
      const p = protocol[onMethodName];
      // @ts-ignore
      p(client, message.args);
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', message);
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  ws.addEventListener('message', (e) => {
    const parsed = JSON.parse(e.data);
    wire.receive(parsed);
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
  context?: import('../server/server-context').ServerContext;
}
export async function openAndConnectToServerInMemory(client: Client, opts: OpenAndConnectToServerInMemoryOpts) {
  const {Server, ServerContext, createDebugWorldMap} = await import('./server-in-client-chunk');

  function maybeDelay(fn: () => void) {
    if (dummyDelay > 0) {
      setTimeout(fn, dummyDelay);
    } else {
      fn();
    }
  }

  const worldMap = createDebugWorldMap();
  const { dummyDelay, verbose, context } = opts;
  const server = new Server({
    context: context ? context : new ServerContext(worldMap),
    verbose,
  });

  const clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    maybeDelay(() => {
      wire.receive(message);
    });
  };
  server.clientConnections.push(clientConnection);

  // Make sure to clone args so no objects are accidently shared.
  const wire: ClientToServerWire = {
    send(message) {
      // const p = ServerToClientProtocol[type]
      maybeDelay(() => {
        const cloned = JSON.parse(JSON.stringify(message));
        clientConnection.messageQueue.push(cloned);
      });
    },
    receive(message) {
      const cloned = JSON.parse(JSON.stringify(message));
      if (server.verbose) console.log('from server', message.type, message.args);
      const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
      const p = protocol[onMethodName];
      // @ts-ignore
      p(client, cloned.args);
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', cloned);
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  return { clientToServerWire: wire, server };
}
