import { Context } from '../context';
import { createClientWorldMap } from '../world-map';
import Client from './client';
import { WebSocketConnection, WorkerConnection } from './connection';
import { ServerWorker } from './server-worker';

export async function connect(hostname: string, port: number): Promise<Client> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${hostname}:${port}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('close', reject);
  });

  const connection = new WebSocketConnection(ws);
  connection.setOnEvent((event) => {
    client.eventEmitter.emit('event', event);
  });
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}

export async function connectToServerWorker(serverWorker: ServerWorker, opts: ServerWorkerOpts): Promise<Client> {
  await serverWorker.startServer(opts);
  const connection = new WorkerConnection(serverWorker.worker);
  connection.setOnEvent((event) => {
    client.eventEmitter.emit('event', event);
  });
  const context = new Context(createClientWorldMap(connection));
  const client = new Client(connection, context);
  return client;
}
