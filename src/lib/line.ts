export function calcStraightLine(start: Point2, end: Point2) {
  const coordinatesArray: Point2[] = [];
  // Translate coordinates
  let x1 = start.x;
  let y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;
  // Define differences and error check
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = (x1 < x2) ? 1 : -1;
  const sy = (y1 < y2) ? 1 : -1;
  let err = dx - dy;
  // Set first coordinates
  coordinatesArray.push({x: x1, y: y1});
  // Main loop
  while (!((x1 === x2) && (y1 === y2))) {
    // eslint-disable-next-line
    const e2 = err << 1;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
    // Set coordinates
    coordinatesArray.push({x: x1, y: y1});
  }
  // Return the result
  return coordinatesArray;
}
