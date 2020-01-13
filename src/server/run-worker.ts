import * as Content from '../content';
import { makeMapImage } from '../lib/map-generator/map-image-maker';
import mapgen from '../mapgen';
import WorldMap from '../world-map';
import ClientConnection from './client-connection';
import { startServer } from './create-server';
import Server from './server';
import { ServerContext } from './server-context';

let opts: ServerWorkerOpts;
let server: Server;
let clientConnection: ClientConnection;
let mapPreview: ReturnType<typeof mapgen> | null = null;

function maybeDelay(fn: () => void) {
  if (opts.dummyDelay > 0) {
    setTimeout(fn, opts.dummyDelay);
  } else {
    fn();
  }
}

async function start() {
  // TODO: make this its own message.
  if (opts.useMapPreview) {
    if (!mapPreview) throw new Error('missing mapPreview');

    const world = new WorldMap();
    world.addPartition(0, mapPreview.partition);
    const context = new ServerContext(world, opts.serverData);
    await context.save();
  }

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
    await Content.loadContentFromNetwork();
    // @ts-ignore
    self.postMessage('ack');
  } else if (e.data.type === 'worker_mapgen') {
    mapPreview = mapgen(e.data);

    // @ts-ignore: Hack to make canvas-node use the given OffscreenCanvas.
    global.document = {
      createElement() {
        return e.data.canvas;
      },
    };

    // This draws to the OffscreenCanvas.
    makeMapImage(mapPreview.mapGenResult);

    // @ts-ignore
    self.postMessage('ack');
  } else if (e.data.type === 'worker_load') {
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
