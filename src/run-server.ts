import * as fs from 'fs';
import * as https from 'https';
import {Server as WebSocketServer} from 'ws';
import mapgen from './mapgen';
import ClientConnection from './server/clientConnection';
import Server from './server/server';

function startServer(port: number) {
  const verbose = true;

  const server = new Server({
    verbose,
  });
  const world = mapgen(100, 100, 1, false);
  server.world = world;

  // TODO support http. don't hardcode.
  const webserver = https.createServer({
    cert: fs.readFileSync('/etc/letsencrypt/live/hoten.cc/fullchain.pem'),
    key: fs.readFileSync('/etc/letsencrypt/live/hoten.cc/privkey.pem'),
  });
  const wss = new WebSocketServer({
    // port,
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

startServer(9001);
