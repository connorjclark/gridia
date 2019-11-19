import * as Content from '../content';
import ClientConnection from './client-connection';
import { startServer } from './create-server';
import Server from './server';

let opts: OpenAndConnectToServerOpts;
let server: Server;
let clientConnection: ClientConnection;

function maybeDelay(fn: () => void) {
  if (opts.dummyDelay > 0) {
    setTimeout(fn, opts.dummyDelay);
  } else {
    fn();
  }
}

async function start() {
  await Content.loadContentFromNetwork();

  clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    maybeDelay(() => {
      // @ts-ignore
      self.postMessage(message);
    });
  };

  server = await startServer(opts);
  server.clientConnections.push(clientConnection);
}

self.addEventListener('message', async (e) => {
  if (e.data.type === 'worker_init') {
    opts = e.data.opts;
    await start();
    // @ts-ignore
    self.postMessage('ack');
  } else {
    maybeDelay(() => {
      clientConnection.messageQueue.push(e.data);
    });
  }
}, false);
