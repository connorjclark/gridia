import { clamp, equalPoints } from './utils';
import WorldMap from './world-map';

// Does not include the starting tile.
export function findPath(map: WorldMap, from: TilePoint, to: TilePoint) {
  const path = [];
  let cur = {...from};
  while (!equalPoints(cur, to)) {
    cur = {
      x: cur.x + clamp(to.x - cur.x, -1, 1),
      y: cur.y + clamp(to.y - cur.y, -1, 1),
      z: cur.z,
    };
    path.push(cur);
  }
  return path;
}
