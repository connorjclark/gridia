// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import Client from '../src/client/client';
import * as WireSerializer from '../src/lib/wire-serializer';
import { Connection } from '../src/client/connection';
import { Context } from '../src/context';
import { Message as MessageToServer } from '../src/protocol/client-to-server-protocol-builder';
import ClientConnection from '../src/server/client-connection';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { createClientWorldMap } from '../src/world-map';

class MemoryConnection extends Connection {
  public constructor(private _clientConnection: ClientConnection) {
    super();
  }

  public send(message: MessageToServer) {
    const cloned = WireSerializer.deserialize<MessageToServer>(WireSerializer.serialize(message));
    this._clientConnection.messageQueue.push(cloned);
  }

  public close() {
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
    const cloned = WireSerializer.deserialize<any>(WireSerializer.serialize(message));
    client.eventEmitter.emit('message', cloned);
  };
  // TODO: why is this needed?
  server.clientConnections.push(clientConnection);

  const connection = new MemoryConnection(clientConnection);
  connection.setOnMessage((message) => {
    const cloned = WireSerializer.deserialize<MessageToServer>(WireSerializer.serialize(message));
    clientConnection.messageQueue.push(cloned);
  });

  const clientContext = new Context(createClientWorldMap(connection));
  const client = new Client(connection, clientContext);
  return { client, server };
}
