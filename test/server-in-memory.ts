import Client from '../src/client/client';
import { Context } from '../src/context';
import { ServerToClientProtocol } from '../src/protocol';
import ClientConnection from '../src/server/client-connection';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { createClientWorldMap } from '../src/world-map';
import createDebugWorldMap from '../src/world-map-debug';

export  async function openAndConnectToServerInMemory(client: Client, opts: OpenAndConnectToServerOpts) {
  // const {Server, ServerContext, createDebugWorldMap} = await import('./server-in-client-chunk');

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
  clientConnection.send = (type, args) => {
    maybeDelay(() => {
      wire.receive(type, args);
    });
  };

  // Make sure to clone args so no objects are accidently shared.
  const wire: ClientToServerWire = {
    send(type, args) {
      // const p = ServerToClientProtocol[type]
      maybeDelay(() => {
        clientConnection.messageQueue.push({
          type,
          args: JSON.parse(JSON.stringify(args)),
        });
      });
    },
    receive(type, args) {
      if (verbose) console.log('from server', type, args);
      const p = ServerToClientProtocol[type];
      // @ts-ignore
      p(client, JSON.parse(JSON.stringify(args)));
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', {type, args});
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  server.addClient(clientConnection);

  return { clientToServerWire: wire, server };
}
