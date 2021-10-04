import * as Content from '../content.js';
import {Database, FsApiDb, LevelDb} from '../database.js';
import {makeMapImage} from '../lib/map-generator/map-image-maker.js';
import * as WireSerializer from '../lib/wire-serializer.js';
import {mapgen, makeBareMap} from '../mapgen.js';
import {WorldMapPartition} from '../world-map-partition.js';
import {WorldMap} from '../world-map.js';

import {ClientConnection} from './client-connection.js';
import {startServer as _startServer} from './create-server.js';
import {ServerContext} from './server-context.js';
import {Server} from './server.js';

let opts: ServerWorkerOpts;
let server: Server;
let clientConnection: ClientConnection;

let previewWorldDataDefinition: WorldDataDefinition | null = null;
let mapPreviewPartition: WorldMapPartition | null = null;
let mapPreviewGenData: ReturnType<typeof mapgen>['mapGenResult'] | null = null;

let mapsDb: Database;

function maybeDelay(fn: () => void) {
  if (opts.dummyDelay > 0) {
    setTimeout(fn, opts.dummyDelay);
  } else {
    fn();
  }
}

async function makeDbForMap(mapName: string) {
  if (initArgs_.directoryHandle) {
    return new FsApiDb(await initArgs_.directoryHandle.getDirectoryHandle(mapName));
  } else {
    return new LevelDb(mapName);
  }
}

async function saveMapGen(name: string) {
  if (!mapPreviewPartition) throw new Error('missing mapPreviewPartition');
  if (!previewWorldDataDefinition) throw new Error('missing previewWorldDataDefinition');

  const world = new WorldMap();
  world.addPartition(0, mapPreviewPartition);

  const context = new ServerContext(previewWorldDataDefinition, world, await makeDbForMap(name));
  await context.save();
}

interface InitArgs {
  directoryHandle?: FileSystemDirectoryHandle;
}
let initArgs_: InitArgs;
function init(args: InitArgs): Promise<void> {
  initArgs_ = args;
  if (args.directoryHandle) {
    mapsDb = new FsApiDb(args.directoryHandle);
  } else {
    // mapsDb = new LevelFs('default');
  }

  return Promise.resolve();
}

async function listMaps() {
  if (mapsDb instanceof FsApiDb) {
    // TODO ?
    return Promise.resolve({mapNames: [] as string[]});
  }

  const databases = await indexedDB.databases();
  const mapNames = [];
  for (const db of databases) {
    if (db.name?.startsWith('level-js-')) {
      mapNames.push(db.name.replace('level-js-', ''));
    }
  }
  mapNames.sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
  return Promise.resolve({mapNames});
}

interface GenerateMapArgs {
  worldDataDefinition: WorldDataDefinition;
  bare: boolean; width: number; height: number; depth: number; seeds: { [id: string]: number };
  canvas?: OffscreenCanvas;
}
async function generateMap(args: GenerateMapArgs): Promise<void> {
  await Content.initializeWorldData(args.worldDataDefinition);
  previewWorldDataDefinition = args.worldDataDefinition;

  if (args.bare) {
    mapPreviewPartition = makeBareMap(args.width, args.height, args.depth);
    mapPreviewGenData = null;
  } else {
    // @ts-expect-error: TODO
    const mapGenResult = mapgen(args);
    mapPreviewPartition = mapGenResult.partition;
    mapPreviewGenData = mapGenResult.mapGenResult;
  }

  if (mapPreviewGenData && args.canvas) {
    // @ts-expect-error: Hack to make canvas-node use the given OffscreenCanvas.
    global.document = {
      createElement() {
        return args.canvas;
      },
    };

    // This draws to the OffscreenCanvas.
    makeMapImage(mapPreviewGenData);
  }

  return Promise.resolve();
}

async function saveGeneratedMap(args: { name: string }): Promise<void> {
  await saveMapGen(args.name);
}

async function startServer(args: ServerWorkerOpts): Promise<void> {
  opts = args; // :(

  clientConnection = new ClientConnection();
  clientConnection.send = (message) => {
    maybeDelay(() => {
      self.postMessage(WireSerializer.serialize(message));
    });
  };

  const db = await makeDbForMap(args.mapName);

  server = await _startServer(args, db);
  server.addClientConnection(clientConnection);
}

async function shutdown(): Promise<void> {
  if (!server) return;

  await server.save();
}

export const RpcMap = {
  init,
  listMaps,
  generateMap,
  saveGeneratedMap,
  startServer,
  shutdown,
};

// TODO: can this event be type checked?
self.addEventListener('message', async (e) => {
  if (e.data.type === 'rpc') {
    // @ts-expect-error
    const result = await RpcMap[e.data.method](e.data.args);
    self.postMessage({
      rpc: e.data.id,
      result,
    });

    return;
  }

  maybeDelay(() => {
    clientConnection.messageQueue.push(WireSerializer.deserialize(e.data));
  });
}, false);
