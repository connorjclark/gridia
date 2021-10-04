import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import {performance} from 'perf_hooks';

import nodeCleanup from 'node-cleanup';
import WS from 'ws';
import yargs from 'yargs';

import {WORLD_DATA_DEFINITIONS} from '../content.js';
import {LevelDb} from '../database.js';
import * as WireSerializer from '../lib/wire-serializer.js';
import {WebRTCSignalServer} from '../lib/wrtc/signal-server.js';

import {ClientConnection} from './client-connection.js';
import {startServer} from './create-server.js';

const wrtcSignalServer = new WebRTCSignalServer();

async function onHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!await wrtcSignalServer.requestHandler(req, res)) {
    res.writeHead(400);
    res.end('?');
  }
}

async function main(options: CLIOptions) {
  // @ts-expect-error
  globalThis.performance = performance;

  if (process.env.GRIDIA_EXECUTION_ENV === 'node') {
    const firebaseAdmin = (await import('firebase-admin')).default;
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.applicationDefault(),
    });
  }

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
  const wss = new WS.Server({
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

    server.addClientConnection(clientConnection);
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

    server.addClientConnection(clientConnection);
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
  worldDataDef: WORLD_DATA_DEFINITIONS.bit16,
});
