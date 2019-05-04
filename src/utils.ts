// export function mouseToWorld(pm: TilePoint): TilePoint {
//     return {
//       x: pm.x + state.viewport.x,
//       y: pm.y + state.viewport.y,
//     };
//   }

export function worldToTile(pw: ScreenPoint, z: number): TilePoint {
  return {
    x: Math.floor(pw.x / 32),
    y: Math.floor(pw.y / 32),
    z,
  };
}

export function worldToSector(ps: TilePoint, SECTOR_SIZE: number): TilePoint {
  return {
    x: Math.floor(ps.x / SECTOR_SIZE),
    y: Math.floor(ps.y / SECTOR_SIZE),
    z: ps.z,
  };
}

export function maxDiff(p1: TilePoint, p2: TilePoint): number {
  return Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
}

export function equalPoints(p1?: TilePoint, p2?: TilePoint) {
  if (p1 === null && p2 === null) return true;
  if (p1 === null || p2 === null) return false;
  return p1.x === p2.x && p1.y === p2.y && p1.z === p2.z;
}

export function equalItems(i1?: Item, i2?: Item) {
  if (i1 === null && i2 === null) return true;
  if (i1 === null || i2 === null) return false;
  return i1.type === i2.type && i1.quantity === i2.quantity;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(Math.min(val, max), min);
}

// 3d matrix
export function matrix<T>(x: number, y: number, z: number, val: T = null): T[][][] {
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
  return Math.floor(Math.random() * (max - min)) + min;
}

//   export function tileToScreen(pt: TilePoint): TilePoint {
//     return {
//       x: pt.x * 32 - state.viewport.x,
//       y: pt.y * 32 - state.viewport.y,
//     }
//   }
