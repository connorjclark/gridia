import {Client} from '../src/client/client.js';
import {Connection} from '../src/client/connection.js';
import {WORLD_DATA_DEFINITIONS} from '../src/content.js';
import {Context} from '../src/context.js';
import {MemoryDb} from '../src/database.js';
import * as WireSerializer from '../src/lib/wire-serializer.js';
import {ProtocolCommand} from '../src/protocol/command-builder.js';
import {ClientConnection} from '../src/server/client-connection.js';
import {ServerContext} from '../src/server/server-context.js';
import {Server} from '../src/server/server.js';
import {createClientWorldMap, WorldMap} from '../src/world-map.js';

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
  opts: OpenAndConnectToServerOpts & { worldMap: WorldMap }) {

  const {verbose, worldMap} = opts;
  const serverContext = new ServerContext(WORLD_DATA_DEFINITIONS.rpgwo, worldMap, new MemoryDb());
  const server = new Server({
    context: serverContext,
    verbose,
  });
  server.init();

  const clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    const cloned = WireSerializer.deserialize<Message>(WireSerializer.serialize(message));
    // TODO ?
    if (!cloned.id) client.eventEmitter.emit('event', cloned.data);
  };
  // TODO: why is this needed?
  server.addClientConnection(clientConnection);

  const connection = new MemoryConnection(clientConnection);
  connection.setOnEvent((event) => {
    const cloned = WireSerializer.deserialize<Event>(WireSerializer.serialize(event));
    clientConnection.messageQueue.push({data: cloned});
  });

  const clientContext = new Context(WORLD_DATA_DEFINITIONS.rpgwo, createClientWorldMap(connection));
  const client = new Client(connection, clientContext);
  return {client, server, clientConnection};
}
