import * as assert from 'assert';
import { MINE, SECTOR_SIZE, WATER } from './constants';
import * as Content from './content';
import { Context, generate } from './lib/map-generator/map-generator';
import WorldMapPartition from './world-map-partition';

function rasterize(ctx: Context) {
  const raster: Uint8Array[] = [];
  for (let x = 0; x < ctx.options.width; x++) {
    raster.push(new Uint8Array(ctx.options.height));
  }

  const pixel = (x: number, y: number, value: number) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && x < ctx.options.width && y >= 0 && y < ctx.options.height) {
      raster[Math.floor(x)][Math.floor(y)] = value;
    }
  };

  // http://www.javascriptteacher.com/bresenham-line-drawing-algorithm.html
  const line = (x1: number, y1: number, x2: number, y2: number, value: number) => {
    // Iterators, counters required by algorithm
    let x, y, dx, dy, dx1, dy1, px, py, xe, ye, i;

    // Calculate line deltas
    dx = x2 - x1;
    dy = y2 - y1;

    // Create a positive copy of deltas (makes iterating easier)
    dx1 = Math.abs(dx);
    dy1 = Math.abs(dy);

    // Calculate error intervals for both axis
    px = 2 * dy1 - dx1;
    py = 2 * dx1 - dy1;

    // The line is X-axis dominant
    if (dy1 <= dx1) {

      // Line is drawn left to right
      if (dx >= 0) {
        x = x1; y = y1; xe = x2;
      } else { // Line is drawn right to left (swap ends)
        x = x2; y = y2; xe = x1;
      }

      pixel(x, y, value); // Draw first pixel

      // Rasterize the line
      for (i = 0; x < xe; i++) {
        x = x + 1;

        // Deal with octants...
        if (px < 0) {
          px = px + 2 * dy1;
        } else {
          if ((dx < 0 && dy < 0) || (dx > 0 && dy > 0)) {
            y = y + 1;
          } else {
            y = y - 1;
          }
          px = px + 2 * (dy1 - dx1);
        }

        // Draw pixel from line span at currently rasterized position
        pixel(x, y, value);
      }

    } else { // The line is Y-axis dominant

      // Line is drawn bottom to top
      if (dy >= 0) {
        x = x1; y = y1; ye = y2;
      } else { // Line is drawn top to bottom
        x = x2; y = y2; ye = y1;
      }

      pixel(x, y, value); // Draw first pixel

      // Rasterize the line
      for (i = 0; y < ye; i++) {
        y = y + 1;

        // Deal with octants...
        if (py <= 0) {
          py = py + 2 * dx1;
        } else {
          if ((dx < 0 && dy < 0) || (dx > 0 && dy > 0)) {
            x = x + 1;
          } else {
            x = x - 1;
          }
          py = py + 2 * (dx1 - dy1);
        }

        // Draw pixel from line span at currently rasterized position
        pixel(x, y, value);
      }
    }
  };

  const polygons = [...ctx.polygons.values()];

  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i];

    // Outline.
    for (let j = 0; j < polygon.corners.length; j++) {
      const corner = polygon.corners[j];
      const nextCorner = polygon.corners[j === polygon.corners.length - 1 ? 0 : j + 1];
      line(corner.x, corner.y, nextCorner.x, nextCorner.y, i + 1);
      pixel(corner.x, corner.y, i + 1);
      pixel(nextCorner.x, nextCorner.y, i + 1);
    }

    // Fill.
    const seen = new Set<string>();
    const queue: Array<{ x: number, y: number }> = [];
    const add = (x: number, y: number) => {
      if (x < 0 || x >= ctx.options.width || y < 0 || y >= ctx.options.height) return;
      if (raster[x][y]) return;
      if (seen.has(x + ',' + y)) return;

      queue.push({ x, y });
      seen.add(x + ',' + y);
    };

    add(Math.round(polygon.center.x), Math.round(polygon.center.y));
    while (queue.length) {
      const { x, y } = queue.pop() || {};
      // TODO make a better type for this stuff.
      if (x === undefined || y === undefined) continue;

      pixel(x, y, i + 1);

      add(x + 1, y);
      add(x - 1, y);
      add(x, y + 1);
      add(x, y - 1);
    }
  }

  return raster;
}

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

  const ctx = generate({
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
  const raster = rasterize(ctx);
  const polygons = [...ctx.polygons.values()];

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
            const polygon = polygons[raster[x][y] - 1];
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
