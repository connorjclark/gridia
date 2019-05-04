import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import {Server as WebSocketServer} from 'ws';
import * as yargs from 'yargs';
import mapgen from './mapgen';
import ClientConnection from './server/clientConnection';
import Server from './server/server';
import { randInt } from './utils';

interface ServerOptions {
  port: number;
  ssl?: {
    cert: string;
    key: string;
  };
}
function startServer(options: ServerOptions) {
  const {port, ssl} = options;
  const verbose = true;

  const server = new Server({
    verbose,
  });
  const world = mapgen(100, 100, 2, false);
  server.world = world;
  world.saveAll();

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
      if (verbose) console.log('got', JSON.parse(data.toString('utf-8')));
      clientConnection.messageQueue.push(JSON.parse(data.toString('utf-8')));
    });

    ws.on('close', (data) => {
      server.removeClient(clientConnection);
    });

    const clientConnection = new ClientConnection();
    clientConnection.send = function(type, args) {
      ws.send(JSON.stringify({type, args}));
    };

    server.addClient(clientConnection);
  });

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(() => {
    if (server.clientConnections.length > 0) {
      if (Object.keys(server.creatureStates).length < 15) {
        const pos = {x: randInt(0, 10), y: randInt(0, 10), z: 0};
        if (server.world.walkable(pos)) {
          server.makeCreature(pos, 9, false);
        }
      }
    } else {
      for (const {creature} of Object.values(server.creatureStates)) {
        server.removeCreature(creature);
      }
    }
  }, 1000);

  setInterval(() => {
    server.world.saveAll();
  }, 1000 * 60 * 5);

  return server;
}

const argv = yargs
  .default('port', 9001)
  .string('sslCert')
  .string('sslKey')
  .parse();

const {sslCert, sslKey, ...mostOfArgs} = argv;
startServer({
  ...mostOfArgs,
  ssl: argv.sslCert ? {cert: sslCert, key: sslKey} : undefined,
});
