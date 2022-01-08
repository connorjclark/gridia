import * as assert from 'assert';

import {Canvas} from 'canvas';
import wfc from 'wavefunctioncollapse';

import {MINE, SECTOR_SIZE, WATER} from './constants.js';
import * as Content from './content.js';
import {generate, GenerateOptions, Polygon} from './lib/map-generator/map-generator.js';
import * as Perlin from './lib/perlin/perlin.js';
import * as Utils from './utils.js';
import {WorldMapPartition} from './world-map-partition.js';

function biomeToFloor(biome: string) {
  if (biome === 'BARE') return 71;
  if (biome === 'BEACH') return 73;
  if (biome === 'LAKE') return WATER;
  if (biome === 'OCEAN') return WATER;
  if (biome === 'SNOW') return 42;
  if (biome === 'TUNDRA') return 62;
  if (biome === 'GRASSLAND') return 57;

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
  return 57;
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

  const map = new WorldMapPartition('bare-map', width, height, depth);

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
        const pos = {x, y, z};
        map.setTile(pos, {
          floor: z ? MINE : 1,
          elevation: 0,
        });
      }
    }
  }

  return map;
}

interface MapGenOptions extends GenerateOptions {
  depth: number;
}

// function findAveragedElevation(polygon: Polygon, point: Point2) {
//   let totalInvertedDistance = 0;
//   let weightedElevation = 0;
//   const invertedDistances = [];

//   for (const corner of polygon.corners) {
//     const invertedDistance = 1 / Utils.dist2(corner, point);
//     if (invertedDistance === Infinity) return corner.elevation;
//     invertedDistances.push(invertedDistance);

//     totalInvertedDistance += invertedDistance;
//   }
//   for (let i = 0; i < invertedDistances.length; i++) {
//     const corner = polygon.corners[i];
//     weightedElevation += corner.elevation * (invertedDistances[i] / totalInvertedDistance);
//   }
//   return weightedElevation;
// }

/**
 * Represents a 2D height map that obeys the following rule:
 * every cell is no more than one height different than every neighbor
 */
class ElevationMap {
  static MIN_VALUE = 0;
  static MAX_VALUE = 100;

  private elevations: number[][];

  constructor(private width: number, private height: number) {
    this.elevations = Utils.matrix(1, width, height, 0)[0];
  }

  getElevation(x: number, y: number) {
    return this.elevations[x][y];
  }

  setElevation(x: number, y: number, value: number) {
    const raise = this.getElevation(x, y) < value;
    while (this.getElevation(x, y) !== value) {
      this.changeElevation(x, y, raise);
    }
  }

  changeElevation(x: number, y: number, raise: boolean) {
    if (raise && this.getElevation(x, y) === ElevationMap.MAX_VALUE) return;
    if (!raise && this.getElevation(x, y) === ElevationMap.MIN_VALUE) return;

    this.elevations[x][y] += raise ? 1 : -1;

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const x1 = x + i;
        const y1 = y + j;
        if (i === 0 && j === 0) continue;
        if (x1 >= this.width || x1 < 0) continue;
        if (y1 >= this.height || y1 < 0) continue;

        if (Math.abs(this.getElevation(x1, y1) - this.getElevation(x, y)) > 1) {
          this.changeElevation(x1, y1, raise);
        }
      }
    }
  }
}

export function mapgen(opts: MapGenOptions) {
  const {width, height, depth} = opts;
  sanityCheck(width, height, depth);

  const map = new WorldMapPartition('generated-map', width, height, depth);
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

  let minElevation = Infinity, maxElevation = -Infinity;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        const pos = {x, y, z};
        let floor = 0;
        let item;

        if (z === 0) {
          // floor = 100 + ((x + y) % 10) * 20;
          const polygonIndex = mapGenResult.raster[x][y] - 1;
          const polygon = mapGenResult.polygons[polygonIndex];
          floor = biomeToFloor(polygon.center.biome);

          // const dist = (Math.abs(width / 2 - x) + Math.abs(height / 2 - y)) / (width / 2 + height / 2);
          // floor = 100 + (Math.round(dist * 10)) * 20;
          // floor = 100 + (raster[x][y] % 10) * 20;
        } else {
          floor = 19;
          item = {type: MINE, quantity: 1};
        }

        map.setTile(pos, {
          floor,
          item,
          elevation: 0,
        });
      }
    }
  }

  for (const polygon of mapGenResult.polygons) {
    const elevation = polygon.center.elevation;
    if (elevation > maxElevation) maxElevation = elevation;
    if (elevation < minElevation) minElevation = elevation;
  }

  const em = new ElevationMap(width, height);
  for (const polygon of mapGenResult.polygons) {
    // Normalize elevation from 0-50.
    const percentile = (polygon.center.elevation - minElevation) / (maxElevation - minElevation);
    const elevation = Math.round(percentile * 50);
    em.setElevation(polygon.center.x, polygon.center.y, elevation);
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const pos = {x, y, z: 0};
      const tile = map.getTile(pos);
      tile.elevation = em.getElevation(x, y);
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

interface GenerateWfcOptions {
  inputTiles: Array<{floor?: number; item?: number}>;
  inputTilesWidth: number;
  inputTilesHeight: number;
  n: number;
  width: number;
  height: number;
  defaultFloor: number;
}

export function gen_wfc(opts: GenerateWfcOptions) {
  sanityCheck(opts.width, opts.height, 1);

  const inputSize = 4;
  const canvas = new Canvas(opts.inputTilesWidth, opts.inputTilesHeight);
  const context = canvas.getContext('2d');

  let nextColor = 0;
  const tileToColorMap = new Map<string, number>();
  const colorToTileIndexMap = new Map<number, number>();

  for (let i = 0; i < opts.inputTiles.length; i++) {
    const tile = opts.inputTiles[i];
    const tileKey = `${tile.floor},${tile.item}`;
    let color = tileToColorMap.get(tileKey);
    if (color === undefined) {
      color = nextColor++;
      tileToColorMap.set(tileKey, color);
      colorToTileIndexMap.set(color, i);
    }

    const x = i % inputSize;
    const y = Math.floor(i / inputSize);
    context.fillStyle = '#' + color.toString(16).padStart(6, '0');
    context.fillRect(x, y, 1, 1);
  }

  const inputImageData = context.getImageData(0, 0, inputSize, inputSize);

  const model = new wfc.OverlappingModel(
    inputImageData.data, inputImageData.width, inputImageData.height, opts.n, opts.width, opts.height, true, false, 8);
  // @ts-expect-error
  model.generate(Math.random);

  const outputImageData = context.createImageData(opts.width, opts.height);
  model.graphics(outputImageData.data);

  const map = new WorldMapPartition('wfc', opts.width, opts.height, 1);
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let sx = 0; sx < map.sectors.length; sx++) {
    for (let sy = 0; sy < map.sectors[0].length; sy++) {
      for (let sz = 0; sz < map.sectors[0][0].length; sz++) {
        map.sectors[sx][sy][sz] = map.createEmptySector();
      }
    }
  }

  for (let x = 0; x < opts.width; x++) {
    for (let y = 0; y < opts.height; y++) {
      const offset = (x + y * opts.width) * 4;
      const r = outputImageData.data[offset + 0];
      const g = outputImageData.data[offset + 1];
      const b = outputImageData.data[offset + 2];
      // eslint-disable-next-line no-bitwise
      const color = (r << 16) + (g << 8) + b;
      const tileIndex = colorToTileIndexMap.get(color);
      if (tileIndex === undefined) throw new Error('unexpected');

      const tile = opts.inputTiles[tileIndex];
      map.setTile({x, y, z: 0}, {
        floor: tile.floor !== undefined ? tile.floor : opts.defaultFloor,
        item: tile.item ? {type: tile.item, quantity: 1} : undefined,
        elevation: 0,
      });
    }
  }

  return map;
}
