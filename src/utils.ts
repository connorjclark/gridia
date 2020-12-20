// export function mouseToWorld(pm: TilePoint): TilePoint {
//     return {
//       x: pm.x + state.viewport.x,
//       y: pm.y + state.viewport.y,
//     };
//   }

import { GFX_SIZE } from './constants';

// TODO rename these 'world's to 'stage'?
export function worldToTile(w: number, pw: ScreenPoint, z: number): TilePoint {
  return {
    w,
    x: Math.floor(pw.x / GFX_SIZE),
    y: Math.floor(pw.y / GFX_SIZE),
    z,
  };
}

// TODO rename these 'world's to 'partition'?
export function worldToSector(ps: PartitionPoint, SECTOR_SIZE: number): PartitionPoint {
  return {
    x: Math.floor(ps.x / SECTOR_SIZE),
    y: Math.floor(ps.y / SECTOR_SIZE),
    z: ps.z,
  };
}

export function maxDiff(p1: TilePoint, p2: TilePoint): number {
  return Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
}

export function dist(p1: PartitionPoint, p2: PartitionPoint): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function equalPoints(p1?: TilePoint | PartitionPoint, p2?: TilePoint | PartitionPoint) {
  if (!p1 && !p2) return true;
  if (!p1 || !p2) return false;
  // @ts-ignore - ignore `w` if either parameter is a partition point
  if (typeof p1.w !== 'undefined' && typeof p2.w !== 'undefined' && p1.w !== p2.w) return false;
  return p1.x === p2.x && p1.y === p2.y && p1.z === p2.z;
}

export function equalItems(i1?: Item, i2?: Item) {
  if (!i1 && !i2) return true;
  if (!i1 || !i2) return false;
  return i1.type === i2.type && i1.quantity === i2.quantity;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(Math.min(val, max), min);
}

// 3d matrix
// TODO: this doesn't seem properly typed.
export function matrix<T>(x: number, y: number, z: number, val?: T): T[][][] {
  const m = Array(x);

  for (let i = 0; i < x; i++) {
    m[i] = Array(y);
    for (let j = 0; j < y; j++) {
      m[i][j] = Array(z);
      for (let k = 0; k < z; k++) {
        m[i][j][k] = val;
      }
    }
  }

  return m;
}

export function randInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function assert(val: any) {
  if (!val) throw new Error('assertion failed');
}

export const ItemLocation = {
  World(loc: TilePoint): ItemLocation {
    return {
      source: 'world',
      loc,
    };
  },
  Container(containerId: number, index?: number): ItemLocation {
    return {
      source: 'container',
      id: containerId,
      index,
    };
  },
  Equal(location1: ItemLocation, location2: ItemLocation) {
    if (location1.source === 'container' && location2.source === 'container') {
      return location1.index === location2.index && location1.source === location2.source;
    }
    if (location1.source === 'world' && location2.source === 'world') {
      return equalPoints(location1.loc, location2.loc);
    }
    return false;
  },
};
