import {Context} from '../context.js';
import {WEBRTC_CONFIG} from '../lib/wrtc/config.js';
import * as CommandBuilder from '../protocol/command-builder.js';
import {createClientWorldMap} from '../world-map.js';

import {Client} from './client.js';
import {Connection, WebRTCConnection, WebSocketConnection, WorkerConnection} from './connection.js';
import {ServerWorker} from './server-worker.js';

function createClient(connection: Connection) {
  // @ts-expect-error: ?
  const context = new Context(null, createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}

type ConnectToServerOpts = {
  type: 'webrtc';
  hostname: string;
  port: number;
} | {
  type: 'ws';
  hostname: string;
  port: number;
} | {
  type: 'serverworker';
  serverWorker: ServerWorker;
  opts: ServerWorkerOpts;
};
export async function connectToServer(opts: ConnectToServerOpts): Promise<Client> {
  if (opts.type === 'webrtc') {
    return createClient(await connectWithWebRTC(opts.hostname, opts.port));
  } else if (opts.type === 'ws') {
    return createClient(await connectWithWebSocket(opts.hostname, opts.port));
  } else if (opts.type === 'serverworker') {
    return createClient(await connectWithServerWorker(opts.serverWorker, opts.opts));
  } else {
    throw new Error('invalid opts: ' + opts);
  }
}

async function connectWithWebRTC(hostname: string, port: number): Promise<Connection> {
  const res = await fetch(`${window.location.protocol}//${hostname}:${port}/webrtc`);
  const {id, offer} = await res.json();

  const peerConnection = new RTCPeerConnection(WEBRTC_CONFIG);

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  let channelsOpenPromiseResolve: Function;
  const channelsOpenPromise = new Promise((resolve) => channelsOpenPromiseResolve = resolve);
  const dataChannels: RTCDataChannel[] = [];

  peerConnection.addEventListener('datachannel', (e) => {
    e.channel.onopen = () => {
      dataChannels.push(e.channel);
      if (dataChannels.length === 2) {
        channelsOpenPromiseResolve();
      }
    };
  });

  // peerConnection.addEventListener('connectionstatechange', (e) => console.log(e.type));
  // peerConnection.addEventListener('iceconnectionstatechange', (e) => console.log(e.type));

  await fetch(`${window.location.protocol}//${hostname}:${port}/webrtc/answer`, {
    method: 'POST',
    body: JSON.stringify({id, answer}),
  });

  await channelsOpenPromise;

  return new WebRTCConnection(peerConnection, dataChannels);
}

async function connectWithWebSocket(hostname: string, port: number): Promise<Connection> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${hostname}:${port}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('close', reject);
  });
  return new WebSocketConnection(hostname, port, ws);
}

async function connectWithServerWorker(serverWorker: ServerWorker, opts: ServerWorkerOpts): Promise<Connection> {
  await serverWorker.startServer(opts);
  return new WorkerConnection(serverWorker.worker);
}

export async function reconnectToServer(deadClient: Client): Promise<{status: 'try-again'|'failure'|'success'}> {
  let newConnection;
  try {
    if (deadClient.connection instanceof WebSocketConnection) {
      newConnection = await connectWithWebSocket(deadClient.connection.hostname, deadClient.connection.port);
    } else {
      return {status: 'failure'};
    }
  } catch (err) {
    if (err instanceof CloseEvent) {
      // ok
    } else {
      console.error(err);
    }
    return {status: 'try-again'};
  }

  // Established a connection, now initialize server/client state.

  try {
    // @ts-expect-error
    deadClient.context = new Context(null, createClientWorldMap(newConnection));
    deadClient.connection = newConnection;
    if (deadClient.firebaseToken) {
      await newConnection.sendCommand(CommandBuilder.login({
        firebaseToken: deadClient.firebaseToken,
      }));
    }
    if (deadClient.player) {
      await newConnection.sendCommand(CommandBuilder.enterWorld({
        playerId: deadClient.player.id,
      }));
    }
  } catch (err) {
    console.error(err);
    return {status: 'failure'};
  }

  return {status: 'success'};
}
