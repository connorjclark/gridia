// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import Client from '../src/client/client';
import { Context } from '../src/context';
import ClientConnection from '../src/server/client-connection';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { createClientWorldMap } from '../src/world-map';
import createDebugWorldMap from '../src/world-map-debug';

// This was used before workers, but now it's just for jest tests.
// Clone messages so that mutations aren't depended on accidentally.
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
      const cloned = JSON.parse(JSON.stringify(message));
      client.eventEmitter.emit('message', cloned);
    });
  };

  const wire: ClientToServerWire = {
    send(message) {
      const cloned = JSON.parse(JSON.stringify(message));
      maybeDelay(() => {
        clientConnection.messageQueue.push(cloned);
      });
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  // TODO: why is this needed?
  server.clientConnections.push(clientConnection);

  return { clientToServerWire: wire, server };
}
