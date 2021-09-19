// yarn build-server && rm -rf server-data && node dist/server/scripts/make-main-world.js

import * as fs from 'fs';

import * as Content from '../content';
import {LevelFs, NodeFs} from '../database';
import {ServerContext} from '../server/server-context';
import {WorldMap} from '../world-map';
import {createTestPartitions} from '../world-map-debug';

// Copies the map saved at `saved-maps/main` to `server-data`,
// plus programatically creates a test map.
async function createMainWorldMap() {
  if (fs.existsSync('server-data')) {
    console.log('server-data/ already exists');
    return;
  }

  const map = new WorldMap();
  const context = new ServerContext(map, new NodeFs('saved-maps/main'));
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

  // main world <-> test world
  const mainWorld = context.map.getPartition(0);
  const testWorld = context.map.getPartition(numMainPartitions);
  mainWorld.getTile({x: 40, y: 20, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: numMainPartitions, x: 20, y: 10, z: 0},
  };
  testWorld.getTile({x: 20, y: 12, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 0, x: 40, y: 22, z: 0},
  };

  fs.mkdirSync('server-data', {recursive: true});
  // context.db = new NodeFs('server-data');
  context.db = new LevelFs('server-data');
  await context.save();
}

createMainWorldMap();
