
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
    }
  }
  
//   export function tileToScreen(pt: Point): Point {
//     return {
//       x: pt.x * 32 - state.viewport.x,
//       y: pt.y * 32 - state.viewport.y,
//     }
//   }