// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import Client from '../src/client/client';
import { Context } from '../src/context';
import ServerToClientProtocol from '../src/protocol/server-to-client-protocol';
import ClientConnection from '../src/server/client-connection';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { createClientWorldMap } from '../src/world-map';
import createDebugWorldMap from '../src/world-map-debug';

const protocol = new ServerToClientProtocol();

// This was used before workers, but now it's just for jest tests.
export async function openAndConnectToServerInMemory(client: Client, opts: OpenAndConnectToServerOpts) {
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

  // Make sure to clone args so no objects are accidently shared.
  const wire: ClientToServerWire = {
    send(message) {
      const cloned = JSON.parse(JSON.stringify(message));
      maybeDelay(() => {
        clientConnection.messageQueue.push(cloned);
      });
    },
    receive(message) {
      // @ts-ignore
      if (opts.verbose) console.log('from server', message.type, message.args);
      const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
      const p = protocol[onMethodName];
      const cloned = JSON.parse(JSON.stringify(message));
      // @ts-ignore
      p(client, cloned.args);
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', cloned);
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  server.clientConnections.push(clientConnection);

  return { clientToServerWire: wire, server };
}
