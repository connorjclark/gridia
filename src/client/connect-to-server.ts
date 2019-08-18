import { Context } from '../context';
import { createClientWorldMap } from '../world-map';
import Client from './client';
import { Connection, WebSocketConnection, WorkerConnection } from './connection';

export async function connect(client: Client, port: number): Promise<Connection> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${window.location.hostname}:${port}`);
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
  client.context = new Context(createClientWorldMap(connection));
  return connection;
}

export async function openAndConnectToServerWorker(client: Client, opts: OpenAndConnectToServerOpts) {
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

  serverWorker.onmessage = (message) => {
    client.eventEmitter.emit('message', message.data);
  };

  client.context = new Context(createClientWorldMap(connection));
  return connection;
}
