import * as Content from '../content';
import {Database, NodeFsDb} from '../database';
import {makeMapImage} from '../lib/map-generator/map-image-maker';
import {Server} from '../server/server';
import {ServerContext, Store} from '../server/server-context';
import * as Utils from '../utils';
import {createMainWorldMap} from '../world-map-debug';

export async function startServer(options: ServerOptions, db: Database) {
  const {verbose} = options;

  let isDbAlreadySetup = false;
  try {
    const keys = await db.getAllKeysInStore(Store.misc);
    isDbAlreadySetup = keys.length > 0;
  } catch {
    // Nope.
  }

  let context: ServerContext;
  if (isDbAlreadySetup) {
    context = await ServerContext.load(db);
  } else {
    // TODO: shouldn't create a world here...
    const {world, mapGenData} = createMainWorldMap();
    context = new ServerContext(world, db);
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

  const server = new Server({
    context,
    verbose,
  });

  const {width, height} = context.map.getPartition(0);

  // This cyclical dependency between ServerContext and WorldMap could be improved.
  context.map.loader = (pos) => context.loadSector(pos);

  server.taskRunner.registerTickSection({
    description: 'cows',
    rate: {seconds: 1},
    fn: () => {
      if (context.clientConnections.length > 0) {
        if (Object.keys(server.creatureStates).length < 10) {
          const x = Utils.randInt(width / 2 - 5, width / 2 + 5);
          const y = Utils.randInt(height / 2 - 5, height / 2 + 5);
          const pos = {w: 0, x, y, z: 0};
          const monster = Content.getRandomMonsterTemplate();
          if (monster && server.context.walkable(pos)) {
            server.createCreature({type: monster.id}, pos);
          }
        }
      } else {
        for (const {creature} of Object.values(server.creatureStates)) {
          server.removeCreature(creature);
        }
      }
    },
  });

  server.taskRunner.registerTickSection({
    description: 'save',
    rate: {minutes: 5},
    fn: () => server.save(),
  });

  server.start();

  console.log('Server started.');
  return server;
}
