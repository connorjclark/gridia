import { Context } from '../context';
import { createClientWorldMap } from '../world-map';
import Client from './client';
import { WebSocketConnection, WorkerConnection } from './connection';

export async function connect(hostname: string, port: number): Promise<Client> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${hostname}:${port}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('close', reject);
  });
  ws.addEventListener('close', () => {
    window.document.body.innerText = 'Lost connection to server. Please refresh.';
  });

  const connection = new WebSocketConnection(ws);
  connection.setOnMessage((message) => {
    client.eventEmitter.emit('message', message);
  });
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}

export async function openAndConnectToServerWorker(opts: OpenAndConnectToServerOpts): Promise<Client> {
  const serverWorker = new Worker('../server/run-worker.ts');

  serverWorker.postMessage({
    type: 'worker_init',
    opts,
  });

  await new Promise((resolve, reject) => {
    serverWorker.onmessage = (e) =>  {
      if (e.data !== 'ack') reject('unexpected data on init');
      delete serverWorker.onmessage;
      resolve();
    };
  });

  const connection = new WorkerConnection(serverWorker);
  connection.setOnMessage((message) => {
    client.eventEmitter.emit('message', message);
  });
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}
