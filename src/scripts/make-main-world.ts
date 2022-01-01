// rm -rf server-data && GRIDIA_EXECUTION_ENV=node yarn ts-node src/scripts/make-main-world.ts

import * as fs from 'fs';

import * as Content from '../content.js';
import {LevelDb, NodeFsDb} from '../database.js';
import {ServerContext} from '../server/server-context.js';
import {createTestPartitions} from '../world-map-debug.js';
import {WorldMap} from '../world-map.js';

// Copies the map saved at `saved-maps/main` to `server-data`,
// plus programatically creates a test map.
async function createMainWorldMap() {
  if (fs.existsSync('server-data')) {
    console.log('server-data/ already exists');
    return;
  }

  const map = new WorldMap();
  await Content.initializeWorldData(Content.WORLD_DATA_DEFINITIONS.rpgwo);
  const context = new ServerContext(Content.WORLD_DATA_DEFINITIONS.rpgwo, map, new NodeFsDb('saved-maps/main'));
  context.map.loader = (pos) => context.loadSector(pos);

  let numMainPartitions = 0;
  for (const _ of fs.readdirSync('saved-maps/main/sector')) {
    await context.loadPartition(numMainPartitions);
    const partition = map.getPartition(numMainPartitions);
    for (let sx = 0; sx < partition.sectors.length; sx++) {
      for (let sy = 0; sy < partition.sectors[0].length; sy++) {
        for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
          await partition.getSectorAsync({x: sx, y: sy, z: sz});
        }
      }
    }

    numMainPartitions++;
  }

  createTestPartitions(map);

  fs.mkdirSync('server-data', {recursive: true});
  // context.db = new NodeFs('server-data');
  context.db = new LevelDb('server-data');
  await context.save();
}

createMainWorldMap();
