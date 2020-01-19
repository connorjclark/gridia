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
  const itemUsesGroupedByTool = new Map<number, ItemUse[]>();
  for (const use of require('../world/content/itemuses.json') as ItemUse[]) {
    let arr = itemUsesGroupedByTool.get(use.tool);
    if (!arr) {
      itemUsesGroupedByTool.set(use.tool, arr = []);
    }
    arr.push(use);
  }
  let i = 0;
  for (const [tool, uses] of Array.from(itemUsesGroupedByTool.entries()).sort(([_, a], [__, b]) => {
    return b.length - a.length;
  }).slice(0, 30)) {
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

  map.getTile({ x: 9, y: 9, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: 0, x: 3, y: 1, z: 0 },
  };
}

export default function createDebugWorldMap() {
  // TODO: standardize naming for map, world map, parititon, etc.
  const world = new WorldMap();
  const width = 1000;
  const height = 1000;
  const depth = 2;

  const partitionStrategy = {
    type: 'voronoi',
    points: 500,
    relaxations: 5,
  } as const;
  const waterStrategy = {
    type: 'radial',
    radius: 0.9,
  } as const;

  const defaultMap = mapgen({ width, height, depth, partitionStrategy, waterStrategy });
  addDebugStuff(defaultMap.partition);
  world.addPartition(0, defaultMap.partition);

  const smallMap = makeBareMap(20, 20, 1);
  world.addPartition(1, smallMap);

  // middle defaultMap <-> topleft defaultMap
  defaultMap.partition.getTile({ x: Math.floor(width / 2), y: Math.floor(height / 2), z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: 0, x: 1, y: 1, z: 0 },
  };
  defaultMap.partition.getTile({ x: 1, y: 1, z: 0 }).item = undefined;
  defaultMap.partition.getTile({ x: 0, y: 0, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: 0, x: Math.floor(width / 2), y: Math.floor(height / 2) - 1, z: 0 },
  };

  // defaultMap <-> smallMap
  defaultMap.partition.getTile({ x: 7, y: 5, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: 1, x: 5, y: 5, z: 0 },
  };
  smallMap.getTile({ x: 7, y: 5, z: 0 }).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: { w: 0, x: 9, y: 12, z: 0 },
  };

  return {
    world,
    mapGenData: [defaultMap.mapGenResult],
  };
}
