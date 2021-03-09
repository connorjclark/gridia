import * as Content from './content';
import mapgen, { makeBareMap } from './mapgen';
import WorldMap from './world-map';
import WorldMapPartition from './world-map-partition';

function addDebugStuff(map: WorldMapPartition) {
  const treeType = Content.getMetaItemByName('Pine Tree').id;
  const flowerType = Content.getMetaItemByName('Cut Red Rose').id;

  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      let item;

      if (x === y) {
        item = {
          type: treeType,
          quantity: 1,
        };
      }

      if (x === y - 1) {
        item = {
          type: flowerType,
          quantity: 1,
        };
      }

      if (item) {
        map.getTile({ x, y, z: 0 }).item = item;
      }
    }
  }

  // Item playground.
  // TODO: this is making the worker bundle include itemuses.json.
  const itemUsesGroupedByTool = new Map<number, ItemUse[]>();
  for (const use of Content.getAllItemUses()) {
    let arr = itemUsesGroupedByTool.get(use.tool);
    if (!arr) {
      itemUsesGroupedByTool.set(use.tool, arr = []);
    }
    arr.push(use);
  }
  let i = 0;
  const itemUsesSample = Array.from(itemUsesGroupedByTool.entries())
    .sort(([_, a], [__, b]) => b.length - a.length)
    .slice(0, 30);
  for (const [tool, uses] of itemUsesSample) {
    const startX = 25;
    const y = i * 3;
    map.getTile({ x: startX, y, z: 0 }).item = { type: tool, quantity: 1 };
    const focusItems = [...new Set(uses.map((u) => u.focus))];
    for (let j = 0; j < focusItems.length; j++) {
      map.getTile({ x: startX + j + 2, y, z: 0 }).item = { type: focusItems[j], quantity: 1 };
    }
    i++;
  }

  // Some stairs.
  const loc = { x: 5, y: 5, z: 0 };
  map.getTile({ ...loc, z: 1 }).floor = map.getTile(loc).floor = 10;
  map.getTile({ ...loc, z: 1 }).item = {
    type: Content.getMetaItemByName('Royal Stairs Up').id,
    quantity: 1,
  };
  map.getTile(loc).item = {
    type: Content.getMetaItemByName('Royal Stairs Down').id,
    quantity: 1,
  };

  // Chests to test containers.
  map.getTile({ x: 8, y: 8, z: 0 }).item = {
    type: Content.getRandomMetaItemOfClass('Container').id,
    quantity: 1,
  };
  map.getTile({ x: 9, y: 8, z: 0 }).item = {
    type: Content.getRandomMetaItemOfClass('Container').id,
    quantity: 1,
  };
}

export function createTestPartitions(map: WorldMap) {
  const width = 1000;
  const height = 1000;
  const depth = 2;

  const partitionStrategy = {
    type: 'voronoi',
    points: 500,
    relaxations: 5,
  } as const;
  const waterStrategy = {
    type: 'perlin',
    percentage: 0.3,
  } as const;

  const testMapResult = mapgen({ width, height, depth, partitionStrategy, waterStrategy, borderIsAlwaysWater: false });
  const testPartition = testMapResult.partition;
  const testPartitionW = map.partitions.size;
  map.addPartition(testPartitionW, testPartition);
  addDebugStuff(testPartition);

  const smallPartition = makeBareMap(20, 20, 1);
  const smallPartitionW = map.partitions.size;
  map.addPartition(smallPartitionW, smallPartition);

  // middle defaultMap <-> topleft defaultMap
  testPartition.getTile({ x: Math.floor(width / 2), y: Math.floor(height / 2), z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: testPartitionW, x: 1, y: 1, z: 0 },
  };
  testPartition.getTile({ x: 1, y: 1, z: 0 }).item = undefined;
  testPartition.getTile({ x: 0, y: 0, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: testPartitionW, x: Math.floor(width / 2), y: Math.floor(height / 2) - 1, z: 0 },
  };

  // defaultMap <-> smallMap
  testPartition.getTile({ x: 7, y: 5, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: smallPartitionW, x: 5, y: 5, z: 0 },
  };
  smallPartition.getTile({ x: 7, y: 5, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: testPartitionW, x: 9, y: 12, z: 0 },
  };

  return testMapResult.mapGenResult;
}

export function createMainWorldMap() {
  // TODO: standardize naming for map, world map, partiton, etc.
  const world = new WorldMap();
  const mapGenResult = createTestPartitions(world);
  return {
    world,
    mapGenData: [mapGenResult],
  };
}
