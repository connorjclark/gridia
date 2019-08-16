import ClientConnection from '../server/client-connection';
import Server from '../server/server';
import { ServerContext } from '../server/server-context';
import createDebugWorldMap from '../world-map-debug';

let opts;
let server: Server;
let clientConnection: ClientConnection;

function maybeDelay(fn: () => void) {
  if (opts.dummyDelay > 0) {
    setTimeout(fn, opts.dummyDelay);
  } else {
    fn();
  }
}

function start() {
  const worldMap = createDebugWorldMap();
  const { verbose, context } = opts;
  server = new Server({
    context: context ? context : new ServerContext(worldMap),
    verbose,
  });

  clientConnection = new ClientConnection();
  clientConnection.send = (type, args) => {
    maybeDelay(() => {
      // @ts-ignore
      self.postMessage({type, args});
    });
  };

  server.addClient(clientConnection);

  setInterval(() => {
    server.tick();
  }, 50);
}

self.addEventListener('message', (e) => {
  if (e.data.type === 'worker_init') {
    opts = e.data.opts;
    start();
    // @ts-ignore
    self.postMessage('ack');
  } else {
    maybeDelay(() => {
      clientConnection.messageQueue.push(e.data);
    });
  }
}, false);
