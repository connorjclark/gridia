// For testing.

import { createCanvas } from 'canvas';
import { generate } from './map-generator';

const width = 400;
const height = 400;

const { polygons, corners } = generate({
  width,
  height,
  partitionStrategy: {
    type: 'square',
    size: 15,
    rand: 0.5,
  },
});

const canvas = createCanvas(width, height, 'svg');
const ctx = canvas.getContext('2d');
ctx.quality = 'best';
ctx.strokeRect(0, 0, width, height);

function getColor(biome: string) {
  if (biome === 'BARE') return 'brown';
  if (biome === 'BEACH') return 'gold';
  if (biome === 'DESERT_SHRUBLAND') return 'tan';
  if (biome === 'GRASSLAND') return 'lightgreen';
  if (biome === 'LAKE') return 'lightblue';
  if (biome === 'OCEAN') return 'darkblue';
  if (biome === 'SCORCHED') return 'darkgrey';
  if (biome === 'SHRUBLAND') return 'lightbrown';
  if (biome === 'SNOW') return 'silver';
  if (biome === 'TEMPERATE_DECIDUOUS_FOREST') return 'green';
  if (biome === 'TEMPERATE_DESERT') return 'yellow';
  if (biome === 'TEMPERATE_RAIN_FOREST') return 'green';
  if (biome === 'TROPICAL_RAIN_FOREST') return 'darkgreen';
  if (biome === 'TROPICAL_SEASONAL_FOREST') return 'green';
  if (biome === 'TUNDRA') return 'cyan';

  return 'black';
}

function getRivers() {
  const result = [];
  const seen = new Set();
  let currentRiverStart;

  const starts = corners
    .filter((c) => !c.upslope && !c.coast)
    .sort((a, b) => b.elevation - a.elevation);
  for (const corner of starts) {
    if (seen.has(corner)) continue;
    currentRiverStart = corner;
    let sum = 0;
    let length = 0;

    let c: typeof corners[0] | undefined = currentRiverStart;
    while (c) {
      length += 1;
      sum += c.river;
      seen.add(c);
      c = c.downslope;
    }

    result.push({ start: currentRiverStart, length, sum, average: sum / length });
  }

  return result.sort((a, b) => b.length - a.length);
}

for (const polygon of polygons.values()) {
  const color = getColor(polygon.center.biome);

  ctx.beginPath();
  ctx.strokeStyle = ctx.fillStyle = color;
  for (const corner of polygon.corners) {
    ctx.lineTo(corner.x, corner.y);
  }
  ctx.stroke();
  ctx.fill();
  ctx.closePath();
}

const rivers = getRivers();

for (const river of rivers.slice(0, 15)) {
  let c: typeof corners[0] | undefined = river.start;

  ctx.beginPath();
  ctx.strokeStyle = 'blue';
  while (c) {
    ctx.lineTo(c.x, c.y);
    c = c.downslope;
  }
  ctx.stroke();
  ctx.closePath();
}

console.log(canvas.toBuffer().toString());
