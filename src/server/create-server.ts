import * as Content from '../content.js';
import {Database, NodeFsDb} from '../database.js';
import {makeMapImage} from '../lib/map-generator/map-image-maker.js';
import {ServerContext, Store} from '../server/server-context.js';
import {Server} from '../server/server.js';
import {createMainWorldMap} from '../world-map-debug.js';

import {BallScript} from './scripts/ball-script.js';
import {BasicScript} from './scripts/basic-script.js';
import {DogScript} from './scripts/dog-script.js';
import {HubWorldScript} from './scripts/hub-world-script.js';
import {ThunderDomeScript} from './scripts/thunder-dome-script.js';

// TODO: separate initializing a world from starting a server
export async function startServer(options: ServerOptions, db: Database) {
  const {verbose} = options;

  let isDbAlreadySetup = false;
  try {
    isDbAlreadySetup = await db.exists(Store.misc, 'meta.json');
  } catch {
    // Nope.
  }

  let context: ServerContext;
  if (isDbAlreadySetup) {
    context = await ServerContext.load(db);
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
        db.put(Store.misc, `map${i}.svg`, canvas.toBuffer().toString());
      }
    }
  }

  // This cyclical dependency between ServerContext and WorldMap could be improved.
  context.map.loader = (pos) => context.loadSector(pos);

  const server = new Server({
    context,
    verbose,
  });

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

  server.start();

  return server;
}
