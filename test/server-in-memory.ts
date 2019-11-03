// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import Client from '../src/client/client';
import { Connection } from '../src/client/connection';
import { Context } from '../src/context';
import { Message as MessageToServer } from '../src/protocol/client-to-server-protocol-builder';
import ClientConnection from '../src/server/client-connection';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { createClientWorldMap } from '../src/world-map';

class MemoryConnection extends Connection {
  constructor(private _clientConnection: ClientConnection) {
    super();
  }

  public send(message: MessageToServer) {
    const cloned = JSON.parse(JSON.stringify(message));
    this._clientConnection.messageQueue.push(cloned);
  }
}

// This was used before workers, but now it's just for jest tests.
// Clone messages so that mutations aren't depended on accidentally.
export async function openAndConnectToServerInMemory(
  opts: OpenAndConnectToServerOpts & {serverContext: ServerContext}) {

  const { verbose, serverContext } = opts;
  const server = new Server({
    context: serverContext,
    verbose,
  });

  const clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    const cloned = JSON.parse(JSON.stringify(message));
    client.eventEmitter.emit('message', cloned);
  };
  // TODO: why is this needed?
  server.clientConnections.push(clientConnection);

  const connection = new MemoryConnection(clientConnection);
  connection.setOnMessage((message) => {
    const cloned = JSON.parse(JSON.stringify(message));
    clientConnection.messageQueue.push(cloned);
  });

  const clientContext = new Context(createClientWorldMap(connection));
  const client = new Client(connection, clientContext);
  return { client, server };
}
