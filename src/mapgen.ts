import * as assert from 'assert';

import {MINE, SECTOR_SIZE, WATER} from './constants';
import * as Content from './content';
import {generate, GenerateOptions} from './lib/map-generator/map-generator';
import * as Perlin from './lib/perlin/perlin';
import * as Utils from './utils';
import {WorldMapPartition} from './world-map-partition';

function biomeToFloor(biome: string) {
  if (biome === 'BARE') return 49;
  if (biome === 'BEACH') return 44;
  if (biome === 'LAKE') return WATER;
  if (biome === 'OCEAN') return WATER;
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

  // TODO
  return 200;
}

function sanityCheck(width: number, height: number, depth: number) {
  assert.ok(width % SECTOR_SIZE === 0);
  assert.ok(height % SECTOR_SIZE === 0);
  assert.ok(width <= 1000);
  assert.ok(height <= 1000);
  assert.ok(depth < 5);
}

export function makeBareMap(width: number, height: number, depth: number) {
  sanityCheck(width, height, depth);

  const map = new WorldMapPartition(width, height, depth);

  // eslint-disable-next-line @typescript-eslint/prefer-for-of
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
        const loc = {x, y, z};
        map.setTile(loc, {
          floor: z ? MINE : 0,
        });
      }
    }
  }

  return map;
}

interface MapGenOptions extends GenerateOptions {
  depth: number;
}

export function mapgen(opts: MapGenOptions) {
  const {width, height, depth} = opts;
  sanityCheck(width, height, depth);

  const map = new WorldMapPartition(width, height, depth);
  const mapGenResult = generate(opts);
  const random = mapGenResult.makeRandom('mines');

  // eslint-disable-next-line @typescript-eslint/prefer-for-of
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
        const loc = {x, y, z};
        let floor = 0;
        let item;

        if (z === 0) {
          // floor = 100 + ((x + y) % 10) * 20;
          const polygonIndex = mapGenResult.raster[x][y] - 1;
          const polygon = mapGenResult.polygons[polygonIndex];
          if (polygon) {
            floor = biomeToFloor(polygon.center.biome);
            // const dist = (Math.abs(width / 2 - x) + Math.abs(height / 2 - y)) / (width / 2 + height / 2);
            // floor = 100 + (Math.round(dist * 10)) * 20;
          } else {
            // TODO ?
            // console.warn({x, y, val: raster[x][y]});
            floor = 0;
          }
          // floor = 100 + (raster[x][y] % 10) * 20;
        } else {
          floor = 19;
          item = {type: MINE, quantity: 1};
        }

        map.setTile(loc, {
          floor,
          item,
        });
      }
    }
  }

  // Mines.
  for (let z = 1; z < depth; z++) {
    // Make some very large veins.
    Perlin.init(random);
    const noise1: number[] = Perlin.generatePerlinNoise({
      width,
      height,
      octaves: 3,
      persistence: 0.5,
    });
    const threshold = [...noise1].sort((a, b) => b - a)[Math.floor(0.05 * noise1.length)] || -Infinity;

    const points = [];
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (noise1[x + y * width] > threshold) {
          points.push({x, y});
          // const minedItem = { type: Content.getRandomMetaItemOfClass('Ore').id, quantity: 1 };
          // map.getTile({x, y, z}).item = {...minedItem};
        }
      }
    }

    // TODO share code from admin-module floodfill?
    const index = (l: Point2) => `${l.x},${l.y}`;
    const seen = new Set<string>();
    const pointIndices = points.map(index);
    while (points.length) {
      const start = points.pop();
      if (!start) break;

      const oreType = Content.getRandomMetaItemOfClass('Ore').id;

      const pending = new Set<string>();
      const locsToSet: Point2[] = [];
      const add = (l: Point2) => {
        const data = index(l);
        if (seen.has(data)) return;
        seen.add(data);

        if (!map.inBounds({...l, z})) return;
        if (!pointIndices.includes(index(l))) return;

        pending.add(data);
      };

      add(start);
      while (pending.size) {
        for (const data of pending.values()) {
          pending.delete(data);
          const [x, y] = data.split(',').map(Number);
          const l = {x, y};
          locsToSet.push(l);

          add({x: x + 1, y});
          add({x: x - 1, y});
          add({x, y: y + 1});
          add({x, y: y - 1});
        }
      }

      for (const point of locsToSet) {
        const ind = points.findIndex((p) => p.x === point.x && point.y === p.y);
        if (ind !== -1) points.splice(ind, 1);
        const tile = map.getTile({...point, z});
        if (tile.item?.type !== MINE) continue;
        if (random() < 0.2) tile.item.oreType = oreType;
      }
    }

    // Make many small veins.
    const numOreVeins = width * height * 0.01;
    for (let i = 0; i < numOreVeins; i++) {
      let x = Utils.randInt(0, width - 1);
      let y = Utils.randInt(0, height - 1);
      const numOre = Utils.randInt(5, 20);
      const oreType = Content.getRandomMetaItemOfClass('Ore').id;
      for (let j = 0; j < numOre; j++) {
        const tile = map.getTile({x, y, z});
        if (tile.item?.type !== MINE) continue;
        if (tile.item.oreType) continue;

        tile.item.oreType = oreType;
        x += Utils.randInt(-1, 1);
        y += Utils.randInt(-1, 1);
      }
    }
  }


  return {
    partition: map,
    mapGenResult,
  };
}
