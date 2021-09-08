import {Context} from '../context';
import {WEBRTC_CONFIG} from '../lib/wrtc/config';
import {ProtocolEvent} from '../protocol/event-builder';
import {createClientWorldMap} from '../world-map';

import {Client} from './client';
import {Connection, WebRTCConnection, WebSocketConnection, WorkerConnection} from './connection';
import {ServerWorker} from './server-worker';

function onProtocolEvent(client: Client, event: ProtocolEvent) {
  client.eventEmitter.emit('event', event);
}

function createClient(connection: Connection) {
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  connection.setOnEvent(onProtocolEvent.bind(undefined, client));
  return client;
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

  const connection = new WebSocketConnection(ws);
  return createClient(connection);
}

export async function connectToServerWorker(serverWorker: ServerWorker, opts: ServerWorkerOpts): Promise<Client> {
  await serverWorker.startServer(opts);
  const connection = new WorkerConnection(serverWorker.worker);
  return createClient(connection);
}
