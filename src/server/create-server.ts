import * as Content from '../content';
import * as fs from '../iso-fs';
import { save } from '../lib/map-generator/map-image-saver';
import Server from '../server/server';
import { ServerContext } from '../server/server-context';
import * as Utils from '../utils';
import createDebugWorldMap from '../world-map-debug';

export async function startServer(options: ServerOptions) {
  const {serverData, verbose} = options;

  let context: ServerContext;
  if (await fs.exists(serverData)) {
    context = await ServerContext.load(serverData);
  } else {
    await fs.mkdir(serverData);
    const {world, maps} = createDebugWorldMap();
    context = new ServerContext(world, serverData);
    await context.save();

    // Only save images in Node server.
    if (global.node) {
      for (let i = 0; i < maps.length; i++) {
        save(maps[i].mapGenResult, `${serverData}/misc/map${i}.svg`);
      }
    }
  }

  const server = new Server({
    context,
    verbose,
  });

  // This cyclical dependency between Server and WorldMap could be improved.
  context.map.loader = (pos) => {
    return context.loadSector(server, pos);
  };

  setInterval(() => {
    server.tick();
  }, 50);

  setInterval(() => {
    if (server.clientConnections.length > 0) {
      if (Object.keys(server.creatureStates).length < 5) {
        const pos = {w: 0, x: Utils.randInt(0, 30), y: Utils.randInt(0, 30), z: 0};
        if (server.context.map.walkable(pos)) {
          server.makeCreatureFromTemplate(Utils.randInt(1, 100), pos);
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
