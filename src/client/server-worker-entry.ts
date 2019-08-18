import * as fs from '../iso-fs';
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

async function start() {
  // TODO: this is duplicated in `run-server.ts`
  const serverData = '/';
  let context: ServerContext;
  if (await fs.exists(serverData)) {
    context = await ServerContext.load(serverData);
  } else {
    await fs.mkdir(serverData);
    const worldMap = createDebugWorldMap();
    context = new ServerContext(worldMap);
    context.setServerDir(serverData);
    await context.save();
  }

  const { verbose } = opts;
  server = new Server({
    context,
    verbose,
  });

  clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    maybeDelay(() => {
      // @ts-ignore
      self.postMessage(message);
    });
  };

  server.clientConnections.push(clientConnection);

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(async () => {
    await server.save();
  }, 1000 * 60 * 5);
  server.save();
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
