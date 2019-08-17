import { Context } from '../context';
import ServerToClientProtocol from '../protocol/server-to-client-protocol';
import { createClientWorldMap } from '../world-map';
import Client from './client';

const protocol = new ServerToClientProtocol();

export async function connect(client: Client, port: number): Promise<ClientToServerWire> {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${window.location.hostname}:${port}`);

  const wire: ClientToServerWire = {
    send(message) {
      ws.send(JSON.stringify(message));
    },
    receive(message) {
      // @ts-ignore
      if (window.Gridia.verbose) console.log('from server', message.type, message.args);
      const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
      const p = protocol[onMethodName];
      // @ts-ignore
      p(client, message.args);
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', message);
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  ws.addEventListener('message', (e) => {
    const parsed = JSON.parse(e.data);
    wire.receive(parsed);
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
    receive(message) {
      if (opts.verbose) console.log('from server', message.type, message.args);
      const onMethodName = 'on' + message.type[0].toUpperCase() + message.type.substr(1);
      const p = protocol[onMethodName];
      // @ts-ignore
      p(client, message.args);
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', message);
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  serverWorker.onmessage = (message) => {
    wire.receive(message.data);
  };

  return { clientToServerWire: wire, serverWorker };
}
