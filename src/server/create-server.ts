import * as Content from '../content';
import { IsoFs } from '../iso-fs';
import { makeMapImage } from '../lib/map-generator/map-image-maker';
import {Server} from '../server/server';
import { ServerContext } from '../server/server-context';
import * as Utils from '../utils';
import { createMainWorldMap } from '../world-map-debug';

export async function startServer(options: ServerOptions, fs: IsoFs) {
  const { verbose } = options;

  let context: ServerContext;
  if ((await fs.readdir('')).length !== 0) {
    context = await ServerContext.load(fs);
  } else {
    // TODO: shouldn't create a world here...
    const { world, mapGenData } = createMainWorldMap();
    context = new ServerContext(world, fs);
    await context.save();

    // Only save images in Node server.
    if (global.node) {
      for (let i = 0; i < mapGenData.length; i++) {
        const canvas = makeMapImage(mapGenData[i]);
        fs.writeFile(`misc/map${i}.svg`, canvas.toBuffer().toString());
      }
    }
  }

  const server = new Server({
    context,
    verbose,
  });

  const { width, height } = context.map.getPartition(0);

  // This cyclical dependency between ServerContext and WorldMap could be improved.
  context.map.loader = (pos) => context.loadSector(pos);

  server.taskRunner.registerTickSection({
    description: 'cows',
    rate: { seconds: 1 },
    fn: () => {
      if (context.clientConnections.length > 0) {
        if (Object.keys(server.creatureStates).length < 10) {
          const x = Utils.randInt(width / 2 - 5, width / 2 + 5);
          const y = Utils.randInt(height / 2 - 5, height / 2 + 5);
          const pos = { w: 0, x, y, z: 0 };
          const monster = Content.getRandomMonsterTemplate();
          if (monster && server.context.walkable(pos)) {
            server.createCreature({type: monster.id}, pos);
          }
        }
      } else {
        for (const { creature } of Object.values(server.creatureStates)) {
          server.removeCreature(creature);
        }
      }
    },
  });

  server.taskRunner.registerTickSection({
    description: 'save',
    rate: { minutes: 5 },
    fn: () => server.save(),
  });

  server.start();

  console.log('Server started.');
  return server;
}
