import * as fs from '../iso-fs';
import Server from '../server/server';
import { ServerContext } from '../server/server-context';
import { randInt } from '../utils';
import createDebugWorldMap from '../world-map-debug';

export async function startServer(options: ServerOptions) {
  const {serverData, verbose} = options;

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

  const server = new Server({
    context,
    verbose,
  });

  // This cyclical dependency between Server and WorldMap could be improved.
  context.map.loader = (pos) => {
    // Loading from disk must be async, but the map loader must be sync.
    // So, return a temporary sector and replace when done reading from disk.
    context.loadSector(server, pos).then((tiles) => {
      context.map.getPartition(pos.w).sectors[pos.x][pos.y][pos.z] = tiles;
    });

    return context.map.createEmptySector();
  };

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(() => {
    if (server.clientConnections.length > 0) {
      if (Object.keys(server.creatureStates).length < 5) {
        const pos = {w: 0, x: randInt(0, 30), y: randInt(0, 30), z: 0};
        if (server.context.map.walkable(pos)) {
          server.makeCreatureFromTemplate(randInt(1, 100), pos);
        }
      }
    } else {
      for (const {creature} of Object.values(server.creatureStates)) {
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
