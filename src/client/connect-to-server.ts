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

  const connection = new WebSocketConnection(ws);
  connection.setOnMessage((message) => {
    client.eventEmitter.emit('message', message);
  });
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}

export async function connectToServerWorker(worker: Worker, opts: ServerWorkerOpts): Promise<Client> {
  worker.postMessage({
    type: 'worker_load',
    opts,
  });

  await new Promise((resolve, reject) => {
    worker.onmessage = (e) =>  {
      if (e.data !== 'ack') reject('unexpected data on load');
      delete worker.onmessage;
      resolve();
    };
  });

  const connection = new WorkerConnection(worker);
  connection.setOnMessage((message) => {
    client.eventEmitter.emit('message', message);
  });
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}
