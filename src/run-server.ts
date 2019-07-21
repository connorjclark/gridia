import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import {Server as WebSocketServer} from 'ws';
import * as yargs from 'yargs';
import Player from './player';
import ClientConnection from './server/client-connection';
import Server from './server/server';
import { ServerContext } from './server/server-context';
import { randInt } from './utils';
import createDebugWorldMap from './world-map-debug';

interface ServerOptions {
  port: number;
  ssl?: {
    cert: string;
    key: string;
  };
  serverData: string;
  verbose: boolean;
}
async function startServer(options: ServerOptions) {
  const {port, ssl, serverData, verbose} = options;

  let context: ServerContext;
  if (fs.existsSync(serverData)) {
    context = await ServerContext.load(serverData);
  } else {
    fs.mkdirSync(serverData);
    const worldMap = createDebugWorldMap();
    context = new ServerContext(worldMap);
    context.setServerDir(serverData);
    await context.save();
  }

  const server = new Server({
    context,
    verbose,
  });

  // This cyclical dependency between Server and WorldMap could be improved.
  context.map.loader = (sectorPoint) => {
    return context.loadSector(server, sectorPoint);
  };

  let webserver;
  if (ssl) {
    webserver = https.createServer({
      cert: fs.readFileSync(ssl.cert),
      key: fs.readFileSync(ssl.key),
    });
  } else {
    webserver = http.createServer();
  }
  const wss = new WebSocketServer({
    server: webserver,
  });
  webserver.listen(port);

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      if (server.verbose) console.log('got', JSON.parse(data.toString('utf-8')));
      clientConnection.messageQueue.push(JSON.parse(data.toString('utf-8')));
    });

    ws.on('close', (data) => {
      server.removeClient(clientConnection);
    });

    const clientConnection = new ClientConnection();
    clientConnection.send = (type, args) => {
      ws.send(JSON.stringify({type, args}));
    };

    server.registerPlayer(clientConnection, {
      player: Object.assign(new Player(), {
        isAdmin: true,
        name: '@@@Player',
      }),
    });
  });

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(() => {
    if (server.clientConnections.length > 0) {
      if (Object.keys(server.creatureStates).length < 5) {
        const pos = {w: 0, x: randInt(0, 30), y: randInt(0, 30), z: 0};
        if (server.context.map.walkable(pos)) {
          server.makeCreatureFromTemplate(randInt(1, 100), pos);
        }
      }
    } else {
      for (const {creature} of Object.values(server.creatureStates)) {
        server.removeCreature(creature);
      }
    }
  }, 1000);

  setInterval(async () => {
    await server.save();
  }, 1000 * 60 * 5);

  console.log('Server started.');
  return server;
}

const argv = yargs
  .default('port', 9001)
  .string('sslCert')
  .string('sslKey')
  .default('verbose', false)
  .default('serverData', 'server-data')
  .parse();

const {sslCert, sslKey, ...mostOfArgs} = argv;
startServer({
  ...mostOfArgs,
  ssl: argv.sslCert ? {cert: sslCert, key: sslKey} : undefined,
});
