import { getMonsterTemplateByName } from '../content';
import * as fs from '../iso-fs';
import { makeMapImage } from '../lib/map-generator/map-image-maker';
import Server from '../server/server';
import { ServerContext } from '../server/server-context';
import * as Utils from '../utils';
import createDebugWorldMap from '../world-map-debug';

export async function startServer(options: ServerOptions) {
  const { serverData, verbose } = options;

  let context: ServerContext;
  if (await fs.exists(serverData)) {
    context = await ServerContext.load(serverData);
  } else {
    const { world, mapGenData } = createDebugWorldMap();
    context = new ServerContext(world, serverData);
    await context.save();

    // Only save images in Node server.
    if (global.node) {
      for (let i = 0; i < mapGenData.length; i++) {
        const canvas = makeMapImage(mapGenData[i]);
        fs.writeFile(`${serverData}/misc/map${i}.svg`, canvas.toBuffer().toString());
      }
    }
  }

  const server = new Server({
    context,
    verbose,
  });

  const { width, height } = context.map.getPartition(0);

  // This cyclical dependency between Server and WorldMap could be improved.
  context.map.loader = (pos) => {
    return context.loadSector(server, pos);
  };

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(() => {
    const COW = getMonsterTemplateByName('Cow');
    if (server.clientConnections.length > 0) {
      if (Object.keys(server.creatureStates).length < 2) {
        const x = Utils.randInt(width / 2 - 5, width / 2 + 5);
        const y = Utils.randInt(height / 2 - 5, height / 2 + 5);
        const pos = { w: 0, x, y, z: 0 };
        if (server.context.map.walkable(pos)) {
          server.makeCreatureFromTemplate(COW, pos);
        }
      }
    } else {
      for (const { creature } of Object.values(server.creatureStates)) {
        server.removeCreature(creature);
      }
    }
  }, 1000);

  setInterval(async () => {
    await server.save();
  }, 1000 * 60 * 5);

  console.log('Server started.');
  return server;
}
