import {Context} from '../context.js';
import {game} from '../game-singleton.js';
import {WEBRTC_CONFIG} from '../lib/wrtc/config.js';
import * as CommandBuilder from '../protocol/command-builder.js';
import {ProtocolEvent} from '../protocol/event-builder.js';
import {createClientWorldMap} from '../world-map.js';

import {Client} from './client.js';
import {Connection, WebRTCConnection, WebSocketConnection, WorkerConnection} from './connection.js';
import {ServerWorker} from './server-worker.js';

function onProtocolEvent(client: Client, event: ProtocolEvent) {
  client.eventEmitter.emit('event', event);
}

function createClient(connection: Connection) {
  // @ts-expect-error: ?
  const context = new Context(null, createClientWorldMap(connection));
  const client = new Client(connection, context);
  connection.setOnEvent(onProtocolEvent.bind(undefined, client));
  return client;
}

export async function reconnectToServer(deadClient: Client): Promise<{status: 'try-again'|'failure'|'success'}> {
  let newConnection;
  try {
    if (deadClient.connection instanceof WebSocketConnection) {
      const newClient = await connectWithWebSocket(deadClient.connection.hostname, deadClient.connection.port);
      newConnection = newClient.connection;
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
    const newClient = createClient(newConnection);
    game.client = newClient;
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
    game.client = deadClient;
    return {status: 'failure'};
  }

  // Shouldn't be necessary to replace this listener, but just in case.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deadClient.connection.setOnEvent(() => {});
  return {status: 'success'};
}

export async function connectWithWebRTC(hostname: string, port: number): Promise<Client> {
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

  const connection = new WebRTCConnection(peerConnection, dataChannels);
  return createClient(connection);
}

export async function connectWithWebSocket(hostname: string, port: number): Promise<Client> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${hostname}:${port}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('close', reject);
  });

  const connection = new WebSocketConnection(hostname, port, ws);
  return createClient(connection);
}

export async function connectToServerWorker(serverWorker: ServerWorker, opts: ServerWorkerOpts): Promise<Client> {
  await serverWorker.startServer(opts);
  const connection = new WorkerConnection(serverWorker.worker);
  return createClient(connection);
}
