// export function mouseToWorld(pm: TilePoint): TilePoint {
//     return {
//       x: pm.x + state.viewport.x,
//       y: pm.y + state.viewport.y,
//     };
//   }

import {v4 as uuidv4} from 'uuid';

import {GFX_SIZE} from './constants.js';

export function isNarrowViewport() {
  return window.innerWidth < 1000;
}

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
  // TODO: return infinity if not in same w, z
  return Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
}

export function dist(p1: PartitionPoint, p2: PartitionPoint): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function dist2(p1: Point2, p2: Point2): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function direction(p1: Point2, p2: Point2): Point2 {
  const x = p2.x - p1.x;
  const y = p2.y - p1.y;
  const m = Math.sqrt(x * x + y * y);
  return {
    x: x / m,
    y: y / m,
  };
}

export function equalPoints(p1?: TilePoint | PartitionPoint, p2?: TilePoint | PartitionPoint) {
  if (!p1 && !p2) return true;
  if (!p1 || !p2) return false;
  // @ts-expect-error - ignore `w` if either parameter is a partition point
  if (typeof p1.w !== 'undefined' && typeof p2.w !== 'undefined' && p1.w !== p2.w) return false;
  return p1.x === p2.x && p1.y === p2.y && p1.z === p2.z;
}

export function pointAdd<T extends Point2>(p1: T, p2: Point2): T {
  const p = {...p1};
  p.x += p2.x;
  p.y += p2.y;
  return p;
}

export function equalItems(i1?: Item, i2?: Item) {
  if (!i1 && !i2) return true;
  if (!i1 || !i2) return false;
  return i1.type === i2.type && i1.quantity === i2.quantity;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(Math.min(val, max), min);
}

const nf = Intl.NumberFormat(undefined, {notation: 'compact'});
export function formatQuantity(quantity: number): string {
  return nf.format(quantity);
}

// 3d matrix
// TODO: this doesn't seem properly typed.
// TODO: rename array3d
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

export function rand(min: number, max: number) {
  return Math.random() * (max - min + 1) + min;
}

export function randInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randArrayItem<T>(array: readonly T[]): T {
  if (array.length === 0) throw new Error('array cannot be empty');
  return array[randInt(0, array.length - 1)];
}

export function emptyArray(n: number) {
  // eslint-disable-next-line
  return [...Array(n)];
}

export function rectContains(rect: { left: number; top: number; width: number; height: number }, pos: Point4) {
  return rect.left <= pos.x && pos.x <= rect.left + rect.width && rect.top <= pos.y && pos.y <= rect.top + rect.height;
}

export function assert(val: any) {
  if (!val) throw new Error('assertion failed');
}

export const ItemLocation = {
  World(pos: TilePoint): WorldLocation {
    return {
      source: 'world',
      pos,
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
      return location1.id === location2.id &&
        location1.index === location2.index && location1.source === location2.source;
    }
    if (location1.source === 'world' && location2.source === 'world') {
      return equalPoints(location1.pos, location2.pos);
    }
    return false;
  },
};

type PrecedenceMatcher<T> =
  | { type: 'equal'; value: T }
  | { type: 'predicate'; fn: (val: T) => boolean };
function matches<T>(item: T, matcher: PrecedenceMatcher<T>) {
  if (matcher.type === 'equal') {
    return item === matcher.value;
  } if (matcher.type === 'predicate') {
    return matcher.fn(item);
  } else {
    return false;
  }
}

export function sortByPrecedence<T>(items: T[], matchers: Array<PrecedenceMatcher<T>>) {
  items.sort((a, b) => {
    const aMatcherIndex = matchers.findIndex((m) => matches(a, m));
    const bMatcherIndex = matchers.findIndex((m) => matches(b, m));

    // If neither value has a match, or they are equal, use an alphabetical comparison.
    if (aMatcherIndex === -1 && bMatcherIndex === -1) {
      return String(a).localeCompare(String(b));
    }

    // If just one value has a match, it is greater.
    if (aMatcherIndex === -1 && bMatcherIndex >= 0) {
      return 1;
    }
    if (bMatcherIndex === -1 && aMatcherIndex >= 0) {
      return -1;
    }

    // Both values have a match, so do a simple comparison.
    return aMatcherIndex - bMatcherIndex;
  });

  return items;
}

export function clone<T>(obj: T): T {
  // @ts-expect-error
  if (globalThis.structuredClone) return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function mapFromRecord<K extends string | number | symbol, V>(record: Record<K, V>): Map<K, V> {
  const map = new Map<K, V>();
  for (const [k, v] of Object.entries(record)) {
    map.set(k as K, v as V);
  }
  return map;
}

export function hasSniffedDataChanged<T>(event: {ops?: SniffedOperation[]} | {}, ...props: Array<keyof T>) {
  if ('ops' in event && event.ops) {
    return props.some((prop) => event.ops?.some((op) => op.path.startsWith('.' + prop)));
  } else {
    return true;
  }
}
