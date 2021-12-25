import Canvas from 'canvas';

import {Corner, MapGenerationResult} from './map-generator.js';

function findCoastPaths(mapGenResult: MapGenerationResult) {
  const paths: Corner[][] = [];
  const seen = new Set<Corner>();
  let currentPath: Corner[] = [];

  const coastCorners = mapGenResult.corners
    .filter((c) => c.coast)
    // Process corners with just one coast first: this will start the paths on the edge of the map
    // rather than at some random corner of the coast.
    .sort((a, b) => a.adjacent.filter((c) => c.coast).length - b.adjacent.filter((c) => c.coast).length);

  for (const corner of coastCorners) {
    let cur = corner;
    while (!seen.has(cur)) {
      seen.add(cur);
      currentPath.push(cur);

      const next = cur.adjacent.find((c) => c.coast && !seen.has(c));
      if (!next) {
        // No more, but attempt to close the path by adding the first corner, if it connects.
        if (cur.adjacent.includes(currentPath[0])) currentPath.push(currentPath[0]);
        break;
      }
      cur = next;
    }

    if (currentPath.length) {
      paths.push(currentPath);
      currentPath = [];
    }
  }

  return paths;
}

function findRivers(mapGenResult: MapGenerationResult) {
  const result = [];
  const seen = new Set();
  let currentRiverStart;

  const starts = mapGenResult.corners
    .filter((c) => !c.upslope && !c.coast && c.river)
    .sort((a, b) => b.elevation - a.elevation);
  for (const corner of starts) {
    if (seen.has(corner)) continue;
    currentRiverStart = corner;
    let sum = 0;
    let length = 0;

    let c: Corner | undefined = currentRiverStart;
    while (c) {
      length += 1;
      sum += c.river;
      seen.add(c);
      c = c.downslope;
    }

    result.push({start: currentRiverStart, length, sum, average: sum / length});
  }

  return result.sort((a, b) => b.length - a.length);
}

function drawPath(ctx: CanvasRenderingContext2D, path: Corner[]) {
  ctx.beginPath();
  for (const {x, y} of path) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function getColor(biome: string) {
  if (biome === 'BARE') return 'brown';
  if (biome === 'BEACH') return 'gold';
  if (biome === 'DESERT_SHRUBLAND') return 'tan';
  if (biome === 'GRASSLAND') return 'lightgreen';
  if (biome === 'LAKE') return 'lightblue';
  if (biome === 'OCEAN') return 'blue';
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

export function makeMapImage(mapGenResult: MapGenerationResult) {
  const {width, height} = mapGenResult.options;

  const canvas = Canvas.createCanvas(width, height, 'svg');
  const ctx = canvas.getContext('2d');
  ctx.quality = 'best';
  ctx.strokeRect(0, 0, width, height);

  // Fill polygons.
  for (const polygon of mapGenResult.polygons) {
    const color = getColor(polygon.center.biome);

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 0.25;
    for (const corner of polygon.corners) {
      ctx.lineTo(corner.x, corner.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw lines.
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  for (const path of findCoastPaths(mapGenResult)) {
    drawPath(ctx, path);
  }

  const rivers = findRivers(mapGenResult).slice(0, 15);
  ctx.lineWidth = 2;
  for (const river of rivers) {
    let c: Corner | undefined = river.start;

    ctx.beginPath();
    ctx.strokeStyle = 'blue';
    while (c) {
      ctx.lineTo(c.x, c.y);
      c = c.downslope;
    }
    ctx.stroke();
    ctx.closePath();
  }

  return canvas;
}
