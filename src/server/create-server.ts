import * as Content from '../content.js';
import {Database, NodeFsDb} from '../database.js';
import {makeMapImage} from '../lib/map-generator/map-image-maker.js';
import {ServerContext} from '../server/server-context.js';
import {Server} from '../server/server.js';
import {createMainWorldMap} from '../world-map-debug.js';

import * as Load from './load-data.js';
import {BallScript} from './scripts/ball-script.js';
import {BasicScript} from './scripts/basic-script.js';
import {DogScript} from './scripts/dog-script.js';
import {HubWorldScript} from './scripts/hub-world-script.js';
import {ThunderDomeScript} from './scripts/thunder-dome-script.js';

// TODO: separate initializing a world from creating a server
export async function createServer(options: ServerOptions, db: Database) {
  const {verbose} = options;

  let isDbAlreadySetup = false;
  try {
    isDbAlreadySetup = await db.exists(Load.Store.misc, 'meta.json');
  } catch {
    // Nope.
  }

  let context: ServerContext;
  if (isDbAlreadySetup) {
    context = await Load.loadServerContext(db);
  } else {
    await Content.initializeWorldData(options.worldDataDef);

    // TODO: shouldn't create a world here...
    const {world, mapGenData} = createMainWorldMap();
    context = new ServerContext(Content.getWorldDataDefinition(), world, db);
    await context.save();

    // Only save images in Node server.
    // TODO: db is now longer a fs, where to save this?
    if (db instanceof NodeFsDb) {
      for (let i = 0; i < mapGenData.length; i++) {
        const canvas = makeMapImage(mapGenData[i]);
        db.put(Load.Store.misc, `map${i}.svg`, canvas.toBuffer().toString());
      }
    }
  }

  // This cyclical dependency between ServerContext and WorldMap could be improved.
  context.map.loader = (pos) => Load.loadSector(context, pos);

  const server = new Server({
    context,
    verbose,
  });

  // TODO remove
  context.server = server;

  server.scriptManager.addScript(BasicScript);
  server.scriptManager.addScript(BallScript);
  server.scriptManager.addScript(DogScript);
  server.scriptManager.addScript(HubWorldScript);
  server.scriptManager.addScript(ThunderDomeScript);

  server.taskRunner.registerTickSection({
    description: 'save',
    rate: {minutes: 5},
    fn: () => server.save(),
  });

  return server;
}
