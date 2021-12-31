// GRIDIA_EXECUTION_ENV=node yarn ts-node src/scripts/copy-over-main-world.ts

import * as fs from 'fs';

import * as Content from '../content.js';
import {LevelDb, NodeFsDb} from '../database.js';
import {ServerContext} from '../server/server-context.js';

// Copies the map saved in `server-data to `saved-maps/main`,
// plus programatically creates a test map.
async function copyOverMainWorldMap() {
  if (!fs.existsSync('server-data')) {
    console.log('server-data/ does not exist');
    return;
  }

  await Content.initializeWorldData(Content.WORLD_DATA_DEFINITIONS.rpgwo);
  const context = await ServerContext.load(new LevelDb('server-data'));
  context.map.loader = (pos) => context.loadSector(pos);

  for (const [key, partition] of context.map.partitions) {
    if (partition.name === 'test-map' || partition.name === 'bare-map') {
      console.log(`ignoring ${partition.name}`);
      context.map.partitions.delete(key);
      continue;
    }

    console.log(`processing ${partition.name}`);

    for (let sx = 0; sx < partition.sectors.length; sx++) {
      for (let sy = 0; sy < partition.sectors[0].length; sy++) {
        for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
          await partition.getSectorAsync({x: sx, y: sy, z: sz});
        }
      }
    }

    for (let x = 0; x < partition.width; x++) {
      for (let y = 0; y < partition.width; y++) {
        for (let z = 0; z < partition.depth; z++) {
          const item = partition.getItem({x, y, z});
          if (!item) continue;

          delete item.growth;
        }
      }
    }
  }

  context.nextCreatureId = 1;
  context.time.epoch = 0;

  context.db = new NodeFsDb('saved-maps/main');
  await context.save();
}

copyOverMainWorldMap();
