import * as assert from 'assert';
import { MINE, SECTOR_SIZE, WATER } from './constants';
import { generate, GenerateOptions } from './lib/map-generator/map-generator';
import WorldMapPartition from './world-map-partition';

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
        map.setTile(loc, {
          floor: z ? MINE : 100,
        });
      }
    }
  }

  return map;
}

interface MapGenOptions extends GenerateOptions {
  depth: number;
}

export default function mapgen(opts: MapGenOptions) {
  const { width, height, depth } = opts;
  sanityCheck(width, height, depth);

  const map = new WorldMapPartition(width, height, depth);
  const mapGenResult = generate(opts);

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
        let floor = 0;

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
          floor = mapGenResult.random() > 0.2 ? MINE : 19;
        }

        map.setTile(loc, {
          floor,
        });
      }
    }
  }

  return {
    partition: map,
    mapGenResult,
  };
}
