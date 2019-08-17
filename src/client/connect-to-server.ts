import { Context } from '../context';
import { createClientWorldMap } from '../world-map';
import Client from './client';

export async function connect(client: Client, port: number): Promise<ClientToServerWire> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${window.location.hostname}:${port}`);

  const wire: ClientToServerWire = {
    send(message) {
      ws.send(JSON.stringify(message));
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  ws.addEventListener('message', (e) => {
    client.eventEmitter.emit('message', JSON.parse(e.data));
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('close', reject);
  });

  ws.addEventListener('close', () => {
    window.document.body.innerText = 'Lost connection to server. Please refresh.';
  });

  return wire;
}

export async function openAndConnectToServerWorker(client: Client, opts: OpenAndConnectToServerOpts) {
  const serverWorker = new Worker('server-worker-entry.ts');

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

  // Make sure to clone args so no objects are accidently shared.
  const wire: ClientToServerWire = {
    send(message) {
      serverWorker.postMessage(message);
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  serverWorker.onmessage = (message) => {
    client.eventEmitter.emit('message', message.data);
  };

  return { clientToServerWire: wire, serverWorker };
}
