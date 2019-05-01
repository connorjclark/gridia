import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import {Server as WebSocketServer} from 'ws';
import * as yargs from  'yargs';
import mapgen from './mapgen';
import ClientConnection from './server/clientConnection';
import Server from './server/server';

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
