import * as Content from '../content';
import * as fs from '../iso-fs';
import { makeMapImage } from '../lib/map-generator/map-image-maker';
import mapgen, { makeBareMap } from '../mapgen';
import WorldMap from '../world-map';
import WorldMapPartition from '../world-map-partition';
import ClientConnection from './client-connection';
import { startServer as _startServer } from './create-server';
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

async function init() {
  await Content.loadContentFromNetwork();
}

async function listMaps() {
  const mapNames = await fs.readdir('/');
  return { mapNames };
}

interface GenerateMapArgs { bare: boolean; width: number; height: number; depth: number; canvas?: OffscreenCanvas; }
async function generateMap(args: GenerateMapArgs) {
  if (args.bare) {
    mapPreviewPartition = makeBareMap(args.width, args.height, args.depth);
  } else {
    // @ts-ignore: TODO
    const mapGenResult = mapgen(args);
    mapPreviewPartition = mapGenResult.partition;
    mapPreviewGenData = mapGenResult.mapGenResult;
  }

  if (mapPreviewGenData && args.canvas) {
    // @ts-ignore: Hack to make canvas-node use the given OffscreenCanvas.
    global.document = {
      createElement() {
        return args.canvas;
      },
    };

    // This draws to the OffscreenCanvas.
    makeMapImage(mapPreviewGenData);
  }
}

async function saveGeneratedMap(args: { name: string }) {
  await saveMapGen(args.name);
}

async function startServer(args: ServerWorkerOpts) {
  opts = args; // :(
  clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    maybeDelay(() => {
      // @ts-ignore
      self.postMessage(message);
    });
  };

  server = await _startServer(args);
  server.clientConnections.push(clientConnection);
}

export const RpcMap = {
  init,
  listMaps,
  generateMap,
  saveGeneratedMap,
  startServer,
};

self.addEventListener('message', async (e) => {
  if (e.data.type === 'rpc') {
    // @ts-ignore
    const result = await RpcMap[e.data.method](e.data.args);
    // @ts-ignore
    self.postMessage({
      rpc: e.data.id,
      result,
    });

    return;
  }

  maybeDelay(() => {
    clientConnection.messageQueue.push(e.data);
  });
}, false);
