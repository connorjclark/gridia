// yarn build-server && rm -rf server-data && node dist/server/scripts/make-main-world.js

import * as fs from 'fs';
import * as Content from '../content';
import * as isoFs from '../iso-fs';
import { createTestPartitions } from '../world-map-debug';
import { ServerContext } from '../server/server-context';
import WorldMap from '../world-map';

async function createMainWorldMap() {
  if (fs.existsSync('server-data')) {
    console.log('server-data/ already exists');
    return;
  }

  // fs.mkdirSync('server-data/sectors', { recursive: true });
  // execFileSync('cp', ['-r', 'saved-maps/main/sectors', 'server-data']);
  // fs.writeFileSync('server-data/meta.json', '{}');

  // isoFs.initialize({ type: 'native', rootDirectoryPath: 'server-data' });
  // const context = await ServerContext.load();
  // createTestPartitions(context.map);
  // await context.save();

  // ------

  // fs.mkdirSync('server-data/sectors', { recursive: true });

  // const map = new WorldMap();
  // for (const _ of fs.readdirSync('saved-maps/main/sectors')) {
  //   // Gets replaced later.
  //   map.addPartition(map.partitions.size, new WorldMapPartition(20, 20, 1));
  // }

  // createTestPartitions(map);

  // isoFs.initialize({ type: 'native', rootDirectoryPath: 'server-data' });
  // await new ServerContext(map).save();
  // execFileSync('cp', ['-r', 'saved-maps/main/sectors', 'server-data']);

  // // lol
  // const context = await ServerContext.load();

  // // @ts-ignore
  // context.map.loader = (pos) => context.loadSector(null, pos);

  // // main world <-> test world
  // const mainWorld = context.map.getPartition(0);
  // const testWorld = context.map.getPartition(context.map.partitions.size - 3);
  // mainWorld.getTile({ x: 7, y: 5, z: 0 }).item = {
  //   type: Content.getMetaItemByName('Warp Portal').id,
  //   quantity: 1,
  //   warpTo: { w: context.map.partitions.size - 3, x: 5, y: 5, z: 0 },
  // };
  // testWorld.getTile({ x: 7, y: 5, z: 0 }).item = {
  //   type: Content.getMetaItemByName('Warp Portal').id,
  //   quantity: 1,
  //   warpTo: { w: 0, x: 9, y: 12, z: 0 },
  // };

  // await context.save();

  // --------

  // execFileSync('cp', ['-r', 'saved-maps/main', 'server-data']);

  // TODO: make a loadMapPartition fn

  const map = new WorldMap();
  isoFs.initialize({ type: 'native', rootDirectoryPath: 'saved-maps/main' });
  const context = new ServerContext(map);
  // @ts-ignore
  context.map.loader = (pos) => context.loadSector(null, pos);

  let numMainPartitions = 0;
  for (const _ of fs.readdirSync('saved-maps/main/sectors')) {
    await context.loadPartition(numMainPartitions);
    const partition = map.getPartition(numMainPartitions);
    for (let sx = 0; sx < partition.sectors.length; sx++) {
      for (let sy = 0; sy < partition.sectors[0].length; sy++) {
        for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
          await partition.getSectorAsync({ x: sx, y: sy, z: sz });
        }
      }
    }

    numMainPartitions++;
  }

  createTestPartitions(map);

  // main world <-> test world
  const mainWorld = context.map.getPartition(0);
  const testWorld = context.map.getPartition(numMainPartitions);
  mainWorld.getTile({ x: 40, y: 20, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: numMainPartitions, x: 20, y: 10, z: 0 },
  };
  testWorld.getTile({ x: 20, y: 12, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: 0, x: 40, y: 22, z: 0 },
  };

  fs.mkdirSync('server-data', { recursive: true });
  isoFs.initialize({ type: 'native', rootDirectoryPath: 'server-data' });
  await context.save();
}

createMainWorldMap();
