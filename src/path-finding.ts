import { dist } from './utils';
import WorldMap from './world-map';

// Does not include the starting tile.
export function findPath(map: WorldMap, from: TilePoint, to: TilePoint) {
  function encodePoint(loc: TilePoint) {
    return loc.x + loc.y * map.width + loc.z * map.width * map.height;
  }

  function decodePoint(encoded: number): TilePoint {
    return {
      x: encoded % map.width,
      y: Math.floor((encoded % (map.width * map.height)) / map.width),
      z: Math.floor(encoded / (map.width * map.height)),
    };
  }

  function estimate(a: TilePoint, b: TilePoint) {
    return dist(a, b);
  }

  function build() {
    const path = [toEncoded];
    let current = toEncoded;
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.push(current);
    }
    return path.reverse().map(decodePoint);
  }

  const fromEncoded = encodePoint(from);
  const toEncoded = encodePoint(to);

  const seen = new Set<number>();
  const open = new Set<number>([fromEncoded]);

  // For each node, which node it can most efficiently be reached from.
  // If a node can be reached from many nodes, cameFrom will eventually contain the
  // most efficient previous step.
  const cameFrom = new Map<number, number>();

  // For each node, the cost of getting from the start node to that node.
  const gScore = new Map();
  gScore.set(fromEncoded, 0);

  // For each node, the total cost of getting from the start node to the goal
  // by passing by that node. That value is partly known, partly heuristic.
  const fScore = new Map();
  fScore.set(fromEncoded, estimate(from, to));

  while (open.size) {
    // Bail if taking too long.
    // Prevents impossible paths from hanging main thread.
    if (seen.size > 1000) return [];

    // Select open node with the lowest f-score.
    // TODO: priority queue.
    let current: number;
    let min = Infinity;
    for (const node of open) {
      if (min > fScore.get(node)) {
        current = node;
        min = fScore.get(node);
      }
    }

    if (current === toEncoded) {
      break;
    }

    const currentNode = decodePoint(current);

    open.delete(current);
    seen.add(current);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = current + dx + dy * map.width;
        if (seen.has(neighbor)) continue;
        const neighborNode = decodePoint(neighbor);

        let neighborG = gScore.get(current) + dist(currentNode, neighborNode);
        if (!map.walkable(neighborNode)) {
          neighborG = Infinity;
        }

        if (!open.has(neighbor)) {
          open.add(neighbor);
        } else if (neighborG >= gScore.get(neighbor)) {
          continue;
        }

        // This path is the best until now. Record it!
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, neighborG);
        fScore.set(neighbor, gScore.get(neighbor) + estimate(neighborNode, to));
      }
    }
  }

  return build();
}
