import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';

import * as firebaseAdmin from 'firebase-admin';
import * as nodeCleanup from 'node-cleanup';
import {Server as WebSocketServer} from 'ws';
import * as yargs from 'yargs';

import {LevelDb} from '../database';
import * as WireSerializer from '../lib/wire-serializer';
import {WebRTCSignalServer} from '../lib/wrtc/signal-server';

import {ClientConnection} from './client-connection';
import {startServer} from './create-server';

const wrtcSignalServer = new WebRTCSignalServer();

async function onHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!await wrtcSignalServer.requestHandler(req, res)) {
    res.writeHead(400);
    res.end('?');
  }
}

async function main(options: CLIOptions) {
  global.node = true;

  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.applicationDefault(),
  });

  const {port, ssl} = options;

  let webserver: http.Server;
  if (ssl) {
    webserver = https.createServer({
      cert: fs.readFileSync(ssl.cert),
      key: fs.readFileSync(ssl.key),
    }, onHttpRequest);
  } else {
    webserver = http.createServer(onHttpRequest);
  }
  const wss = new WebSocketServer({
    server: webserver,
  });
  webserver.listen(port);

  const server = await startServer(options, new LevelDb(options.directoryPath));

  wrtcSignalServer.onConnectionEstablished = (peerConnection) => {
    // @ts-expect-error
    const channels: RTCDataChannel[] = peerConnection.channels;
    const bestEffortChannel = channels.find((c) => c.label === 'best-effort');
    const guarenteedChannel = channels.find((c) => c.label === 'guarenteed');
    if (!bestEffortChannel) throw new Error('missing channel');
    if (!guarenteedChannel) throw new Error('missing channel');

    for (const channel of channels) {
      channel.addEventListener('message', (e) => {
        const message = WireSerializer.deserialize<any>(e.data.toString('utf-8'));
        if (server.verbose) console.log('got', message);
        clientConnection.messageQueue.push(message);
      });
    }

    peerConnection.addEventListener('connectionstatechange', () => {
      if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
        server.removeClient(clientConnection);
      }
    });

    const clientConnection = new ClientConnection();
    clientConnection.send = (message) => {
      if (guarenteedChannel.readyState === 'open') {
        guarenteedChannel.send(WireSerializer.serialize(message));
      }
    };

    server.context.clientConnections.push(clientConnection);
  };

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

    server.context.clientConnections.push(clientConnection);
  });

  nodeCleanup((exitCode, signal) => {
    if (!signal) return;

    nodeCleanup.uninstall();
    console.log('Shutting down server ...');
    webserver.close();
    server.stop();
    server.save().then(() => {
      console.log('Saved! Exiting now.');
      process.kill(process.pid, signal);
    });
    return false;
  });

  return server;
}

const argv = yargs
  .default('port', 9001)
  .string('sslCert')
  .string('sslKey')
  .default('verbose', false)
  .default('directoryPath', 'server-data')
  .parse();

const {sslCert, sslKey, ...mostOfArgs} = argv;
void main({
  ...mostOfArgs,
  ssl: sslKey && sslCert ? {cert: sslCert, key: sslKey} : undefined,
});
