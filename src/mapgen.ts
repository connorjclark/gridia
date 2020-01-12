import * as assert from 'assert';
import { MINE, SECTOR_SIZE, WATER } from './constants';
import * as Content from './content';
import { generate } from './lib/map-generator/map-generator';
import WorldMapPartition from './world-map-partition';

function biomeToFloor(biome: string) {
  if (biome === 'BARE') return 49;
  if (biome === 'BEACH') return 44;
  if (biome === 'LAKE') return WATER;
  if (biome === 'OCEAN') return 5;
  if (biome === 'SNOW') return 42;
  if (biome === 'TUNDRA') return 300;

  if (biome === 'GRASSLAND') return 200;

  // if (biome === 'DESERT_SHRUBLAND') return 'tan';
  // if (biome === 'GRASSLAND') return 'lightgreen';
  // if (biome === 'SCORCHED') return 'darkgrey';
  // if (biome === 'SHRUBLAND') return 'lightbrown';
  // if (biome === 'TEMPERATE_DECIDUOUS_FOREST') return 'green';
  // if (biome === 'TEMPERATE_DESERT') return 'yellow';
  // if (biome === 'TEMPERATE_RAIN_FOREST') return 'green';
  // if (biome === 'TROPICAL_RAIN_FOREST') return 'darkgreen';
  // if (biome === 'TROPICAL_SEASONAL_FOREST') return 'green';

  return 0;
}

export default function mapgen(width: number, height: number, depth: number, bare: boolean): WorldMapPartition {
  assert.ok(width % SECTOR_SIZE === 0);
  assert.ok(height % SECTOR_SIZE === 0);
  assert.ok(width <= 1000);
  assert.ok(height <= 1000);
  assert.ok(depth < 5);

  const treeType = Content.getMetaItemByName('Pine Tree').id;
  const flowerType = Content.getMetaItemByName('Cut Red Rose').id;

  const mapGenResult = generate({
    width,
    height,
    partitionStrategy: {
      type: 'square',
      size: 15,
      rand: 0.5,
    },
    waterStrategy: {
      type: 'radial',
      radius: 0.9,
    },
  });
  const polygons = [...mapGenResult.polygons.values()];

  const map = new WorldMapPartition(width, height, depth);

  // tslint:disable-next-line: prefer-for-of
  for (let sx = 0; sx < map.sectors.length; sx++) {
    for (let sy = 0; sy < map.sectors[0].length; sy++) {
      for (let sz = 0; sz < map.sectors[0][0].length; sz++) {
        map.sectors[sx][sy][sz] = map.createEmptySector();
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        const loc = { x, y, z };
        if (bare) {
          map.setTile(loc, {
            floor: z ? MINE : 100,
          });
        } else {
          let floor = 0;
          let item;

          if (z === 0) {
            // floor = 100 + ((x + y) % 10) * 20;
            const polygon = polygons[mapGenResult.raster[x][y] - 1];
            if (polygon) {
              floor = biomeToFloor(polygon.center.biome);
            } else {
              // TODO ?
              // console.warn({x, y, val: raster[x][y]});
              floor = 0;
            }
            // floor = 100 + (raster[x][y] % 10) * 20;

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
          } else {
            floor = Math.random() > 0.2 ? MINE : 19;
          }

          map.setTile(loc, {
            floor,
            item,
          });
        }
      }
    }
  }

  if (!bare) {
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

  return map;
}
