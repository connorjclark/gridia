import * as Content from '../content';
import * as fs from '../iso-fs';
import { makeMapImage } from '../lib/map-generator/map-image-maker';
import mapgen, { makeBareMap } from '../mapgen';
import WorldMap from '../world-map';
import WorldMapPartition from '../world-map-partition';
import ClientConnection from './client-connection';
import { startServer } from './create-server';
import Server from './server';
import { ServerContext } from './server-context';

let opts: ServerWorkerOpts;
let server: Server;
let clientConnection: ClientConnection;

let mapPreviewPartition: WorldMapPartition | null = null;
let mapPreviewGenData: ReturnType<typeof mapgen>['mapGenResult'] | null = null;

function maybeDelay(fn: () => void) {
  if (opts.dummyDelay > 0) {
    setTimeout(fn, opts.dummyDelay);
  } else {
    fn();
  }
}

async function saveMapGen(name: string) {
  if (!mapPreviewPartition) throw new Error('missing mapPreviewPartition');

  const world = new WorldMap();
  world.addPartition(0, mapPreviewPartition);
  const context = new ServerContext(world, name);
  await context.save();
}

async function start() {
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
  } else if (e.data.type === 'worker_listmaps') {
    const mapNames = await fs.readdir('/');

    // @ts-ignore
    self.postMessage({mapNames});
  } else if (e.data.type === 'worker_mapgen') {
    if (e.data.bare) {
      mapPreviewPartition = makeBareMap(e.data.width, e.data.height, e.data.depth);
    } else {
      const mapGenResult = mapgen(e.data);
      mapPreviewPartition = mapGenResult.partition;
      mapPreviewGenData = mapGenResult.mapGenResult;
    }

    if (mapPreviewGenData && e.data.canvas) {
      // @ts-ignore: Hack to make canvas-node use the given OffscreenCanvas.
      global.document = {
        createElement() {
          return e.data.canvas;
        },
      };

      // This draws to the OffscreenCanvas.
      makeMapImage(mapPreviewGenData);
    }

    // @ts-ignore
    self.postMessage('ack');
  } else if (e.data.type === 'worker_savemapgen') {
    saveMapGen(e.data.name);
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
