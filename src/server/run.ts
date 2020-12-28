import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { Server as WebSocketServer } from 'ws';
import * as yargs from 'yargs';
import * as WireSerializer from '../lib/wire-serializer';
import ClientConnection from './client-connection';
import { startServer } from './create-server';

async function main(options: CLIOptions) {
  global.node = true;

  const { port, ssl } = options;

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

  const server = await startServer(options);

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const message = WireSerializer.deserialize<any>(data.toString('utf-8'));
      if (server.verbose) console.log('got', message);
      clientConnection.messageQueue.push(message);
    });

    ws.on('close', () => {
      server.removeClient(clientConnection);
    });

    const clientConnection = new ClientConnection();
    clientConnection.send = (message) => {
      ws.send(WireSerializer.serialize(message));
    };

    server.clientConnections.push(clientConnection);
  });

  return server;
}

const argv = yargs
  .default('port', 9001)
  .string('sslCert')
  .string('sslKey')
  .default('verbose', false)
  .default('serverData', 'server-data')
  .parse();

const { sslCert, sslKey, ...mostOfArgs } = argv;
void main({
  ...mostOfArgs,
  ssl: sslKey && sslCert ? { cert: sslCert, key: sslKey } : undefined,
});
