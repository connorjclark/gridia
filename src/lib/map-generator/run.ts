// For testing.

import * as fs from 'fs';

import { generate } from './map-generator';
import { makeMapImage } from './map-image-maker';

function get<T>(env: string, defaultValue: T) {
  const value = process.env[env];
  if (value !== undefined) return parseInt(value, 10);
  return defaultValue;
}

const mapGenResult = generate({
  width: get('WIDTH', 400),
  height: get('HEIGHT', 400),
  partitionStrategy: {
    type: 'voronoi',
    points: get('POINTS', 300),
    relaxations: 3,
  },
  waterStrategy: {
    type: 'radial',
    radius: 0.9,
  },
  borderIsAlwaysWater: false,
});

fs.mkdirSync('mapgen-temp', {recursive: true});

const svg = makeMapImage(mapGenResult).toBuffer().toString();
fs.writeFileSync('mapgen-temp/map.svg', svg);

let str = '';
const symbols = '0123456789ABCDEFGHIJK';
for (let y = 0; y < mapGenResult.options.height; y++) {
  for (let x = 0; x < mapGenResult.options.width; x++) {
    if (mapGenResult.raster[x][y] === 0) str += '.';
    else str += symbols.charAt(mapGenResult.raster[x][y] % symbols.length);
  }
  str += '\n';
}
fs.writeFileSync('mapgen-temp/raster.txt', str);
