// export function mouseToWorld(pm: Point): Point {
//     return {
//       x: pm.x + state.viewport.x,
//       y: pm.y + state.viewport.y,
//     };
//   }

export function worldToTile(pw: Point): Point {
  return {
    x: Math.floor(pw.x / 32),
    y: Math.floor(pw.y / 32),
  };
}

export function worldToSector(ps: Point, SECTOR_SIZE: number): Point {
  return {
    x: Math.floor(ps.x / SECTOR_SIZE),
    y: Math.floor(ps.y / SECTOR_SIZE),
  };
}

export function maxDiff(p1: Point, p2: Point): number {
  return Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
}

export function equalPoints(p1?: Point, p2?: Point) {
  if (p1 === null && p2 === null) return true;
  if (p1 === null || p2 === null) return false;
  return p1.x === p2.x && p1.y === p2.y;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(Math.min(val, max), min);
}

//   export function tileToScreen(pt: Point): Point {
//     return {
//       x: pt.x * 32 - state.viewport.x,
//       y: pt.y * 32 - state.viewport.y,
//     }
//   }
