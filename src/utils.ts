// export function mouseToWorld(pm: TilePoint): TilePoint {
//     return {
//       x: pm.x + state.viewport.x,
//       y: pm.y + state.viewport.y,
//     };
//   }

import { v4 as uuidv4 } from 'uuid';
import { GFX_SIZE } from './constants';

export function uuid() {
  return uuidv4();
}

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

export function formatQuantity(quantity: number) {
  if (quantity > 9999999) {
    // Ex: 10100000 -> 10.1M
    return Math.floor(Math.round(quantity / 100000)) / 10 + 'M';
  } else if (quantity > 9999) {
    // Ex: 10100 -> 10.1K
    return Math.floor(Math.round(quantity / 100)) / 10 + 'K';
  } else {
    return quantity.toString();
  }
}

// 3d matrix
// TODO: this doesn't seem properly typed.
export function matrix<T>(x: number, y: number, z: number, val?: T): T[][][] {
  const m = Array(x) as T[][][];

  for (let i = 0; i < x; i++) {
    m[i] = Array(y) as T[][];
    for (let j = 0; j < y; j++) {
      m[i][j] = Array(z) as T[];
      for (let k = 0; k < z; k++) {
        m[i][j][k] = val as T;
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

export function emptyArray(n: number) {
  // eslint-disable-next-line
  return [...Array(n)];
}

export function rectContains(rect: { left: number; top: number; width: number; height: number }, loc: Point4) {
  return rect.left <= loc.x && loc.x <= rect.left + rect.width && rect.top <= loc.y && loc.y <= rect.top + rect.height;
}

export function assert(val: any) {
  if (!val) throw new Error('assertion failed');
}

export const ItemLocation = {
  World(loc: TilePoint): WorldLocation {
    return {
      source: 'world',
      loc,
    };
  },
  Container(containerId: string, index?: number): ContainerLocation {
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
