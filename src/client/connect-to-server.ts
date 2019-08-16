import { Context } from '../context';
import { ServerToClientProtocol } from '../protocol';
import { createClientWorldMap } from '../world-map';
import Client from './client';

export async function connect(client: Client, port: number): Promise<ClientToServerWire> {
  const verbose = true;

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${window.location.hostname}:${port}`);

  const wire: ClientToServerWire = {
    send(type, args) {
      ws.send(JSON.stringify({
        type,
        args,
      }));
    },
    receive(type, args) {
      if (verbose) console.log('from server', type, args);
      const p = ServerToClientProtocol[type];
      // @ts-ignore
      p(client, args);
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', {type, args});
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  ws.addEventListener('message', (e) => {
    const parsed = JSON.parse(e.data);
    wire.receive(parsed.type, parsed.args);
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
    send(type, args) {
      // const p = ServerToClientProtocol[type]
      serverWorker.postMessage({
        type,
        args: JSON.parse(JSON.stringify(args)),
      });
    },
    receive(type, args) {
      if (opts.verbose) console.log('from server', type, args);
      const p = ServerToClientProtocol[type];
      // @ts-ignore
      p(client, JSON.parse(JSON.stringify(args)));
      // Allow for hooks in the main client code. Should
      // only be used for refreshing UI, not updating game state.
      client.eventEmitter.emit('message', {type, args});
    },
  };
  client.context = new Context(createClientWorldMap(wire));

  serverWorker.onmessage = (message) => {
    // @ts-ignore
    wire.receive(message.data.type, message.data.args);
  };

  return { clientToServerWire: wire, serverWorker };
}
