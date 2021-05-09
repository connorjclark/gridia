// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import Client from '../src/client/client';
import * as WireSerializer from '../src/lib/wire-serializer';
import { Connection } from '../src/client/connection';
import { Context } from '../src/context';
import ClientConnection from '../src/server/client-connection';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { createClientWorldMap } from '../src/world-map';
import { ProtocolCommand } from '../src/protocol/command-builder';

class MemoryConnection extends Connection {
  constructor(private _clientConnection: ClientConnection) {
    super();
  }

  send_(message: { id: number; data: ProtocolCommand }) {
    const cloned = WireSerializer.deserialize<Message>(WireSerializer.serialize(message));
    this._clientConnection.messageQueue.push(cloned);
  }

  close() {
    // Do nothing.
  }
}

type OpenAndConnectToServerOpts = any; // ?what

// This was used before workers, but now it's just for jest tests.
// Clone messages so that mutations aren't depended on accidentally.
export function openAndConnectToServerInMemory(
  opts: OpenAndConnectToServerOpts & { serverContext: ServerContext }) {

  const { verbose, serverContext } = opts;
  const server = new Server({
    context: serverContext,
    verbose,
  });

  const clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    const cloned = WireSerializer.deserialize<Message>(WireSerializer.serialize(message));
    // ?
    if (!cloned.id) client.eventEmitter.emit('event', cloned.data);
  };
  // TODO: why is this needed?
  server.context.clientConnections.push(clientConnection);

  const connection = new MemoryConnection(clientConnection);
  connection.setOnEvent((event) => {
    const cloned = WireSerializer.deserialize<Event>(WireSerializer.serialize(event));
    clientConnection.messageQueue.push({ data: cloned });
  });

  const clientContext = new Context(createClientWorldMap(connection));
  const client = new Client(connection, clientContext);
  return { client, server };
}
