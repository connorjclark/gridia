// http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/
// https://github.com/amitp/mapgen2/blob/4394df0e04101dbbdc36ee1e61ad7d62446bb3f1/Map.as

// tslint:disable no-shadowed-variable

export interface Context {
  options: GenerateOptions;
  random: () => number;
  polygons: Map<Point, Polygon>;
  corners: Corner[];
}

interface Point {
  x: number;
  y: number;
}

export interface Corner extends Point {
  polygons: Polygon[];
  adjacent: Corner[];
  downslope?: Corner;
  upslope?: Corner;
  watershed: Corner;
  watershed_size: number;
  border: boolean;
  ocean: boolean;
  coast: boolean;
  water: boolean;
  elevation: number;
  moisture: number;
  river: number;
}

interface Center extends Point {
  water: boolean;
  border: boolean;
  ocean: boolean;
  coast: boolean;
  elevation: number;
  biome: string;
  moisture: number;
}

export interface Polygon {
  center: Center;
  corners: Corner[];
  adjacent: Polygon[];
}

interface GenerateOptions {
  width: number;
  height: number;
  seed?: string;
  partitionStrategy: { type: 'square', size: number, rand?: number };
}

function squarePartition(size: number, rand: number, ctx: Context) {
  if (rand > 0.5 || rand < 0) throw new Error();
  const { width, height } = ctx.options;

  const polygons = new Map<Point, Polygon>();
  const corners = new Map<string, Corner>();

  function add<T>(arr: T[], item: T) {
    if (arr.includes(item)) return;
    arr.push(item);
  }

  function corner(x: number, y: number): Corner {
    const key = `${x},${y}`;
    const existingCorner = corners.get(key);
    if (existingCorner) return existingCorner;

    const corner = {
      x,
      y,
      polygons: [],
      adjacent: [],
      watershed: null as any,
      watershed_size: 0,
      border: false,
      water: false,
      coast: false,
      ocean: false,
      elevation: 0,
      moisture: 0,
      river: 0,
    };
    corners.set(key, corner);
    return corner;
  }

  function center(x: number, y: number): Center {
    return {
      x,
      y,
      water: false,
      elevation: 0,
      moisture: 0,
      coast: false,
      ocean: false,
      border: false,
      biome: '',
    };
  }

  function square(x: number, y: number) {
    const square = {
      center: center(x + size / 2, y + size / 2),
      corners: [
        corner(x, y),
        corner(x + size, y),
        corner(x + size, y + size),
        corner(x, y + size),
      ],
      adjacent: [],
    };
    for (const corner of square.corners) {
      add(corner.polygons, square);
    }
    for (let i = 0; i < square.corners.length; i++) {
      const before = square.corners[i === 0 ? square.corners.length - 1 : i - 1];
      const after = square.corners[i === square.corners.length - 1 ? 0 : i + 1];
      add(square.corners[i].adjacent, before);
      add(square.corners[i].adjacent, after);
    }
    polygons.set(square.center, square);
  }

  let y = 0;
  while (y < height) {
    let x = 0;
    while (x < width) {
      square(Math.min(x, width), Math.min(y, height));
      x += size;
    }
    y += size;
  }

  for (const corner of corners.values()) {
    for (const p1 of corner.polygons) {
      for (const p2 of corner.polygons) {
        if (p1 !== p2) add(p1.adjacent, p2);
      }
    }

    if (rand && corner.x !== 0 && corner.x !== width && corner.y !== 0 && corner.y !== width) {
      corner.x = corner.x + size * rand * (0.5 - ctx.random());
      corner.y = corner.y + size * rand * (0.5 - ctx.random());
    }
    corner.x = Math.min(corner.x, width);
    corner.y = Math.min(corner.y, height);
  }

  return { polygons, corners: [...corners.values()] };
}

function setBorder(ctx: Context) {
  const { width, height } = ctx.options;

  for (const corner of ctx.corners) {
    const { x, y } = corner;
    corner.border = x === 0 || y === 0 || x === width || y === height;
  }
}

function setWater(ctx: Context) {
  const { width, height } = ctx.options;
  const isWaterFilter = ({ x, y }: Point) =>
    Math.sqrt(Math.pow(x / width - 0.5, 2) + Math.pow(y / height - 0.5, 2)) > 0.4;

  for (const polygon of ctx.polygons.values()) {
    polygon.center.water = isWaterFilter(polygon.center);
  }

  for (const corner of ctx.corners) {
    corner.water = corner.polygons.some((p) => p.center.water);
  }
}

function setOceanCoastAndLand(ctx: Context) {
  const queue: Polygon[] = [];

  const LAKE_THRESHOLD = 0.3;
  for (const polygon of ctx.polygons.values()) {
    if (polygon.corners.some((c) => c.border)) {
      polygon.center.border = true;
      polygon.center.ocean = true;
      polygon.center.water = true;
      queue.push(polygon);
    }

    const numWater = polygon.corners.filter((c) => c.water).length;
    polygon.center.water = polygon.center.ocean || numWater >= polygon.corners.length * LAKE_THRESHOLD;
  }

  while (queue.length) {
    const polygon = queue.shift();
    if (!polygon) throw new Error();

    for (const n of polygon.adjacent) {
      if (n.center.water && !n.center.ocean) {
        n.center.ocean = true;
        queue.push(n);
      }
    }
  }

  for (const polygon of ctx.polygons.values()) {
    polygon.center.coast =
      polygon.adjacent.some((p) => p.center.ocean) && polygon.adjacent.some((p) => !p.center.water);
  }

  for (const corner of ctx.corners) {
    const numTouchesLand = corner.polygons.filter((p) => !p.center.water).length;
    const numTouchesOcean = corner.polygons.filter((p) => p.center.ocean).length;
    corner.ocean = numTouchesOcean === corner.polygons.length;
    corner.coast = numTouchesLand > 0 && numTouchesOcean > 0;
    corner.water = corner.border || (numTouchesLand !== corner.polygons.length && !corner.coast);
  }
}

function setElevation(ctx: Context) {
  const queue = [];

  for (const corner of ctx.corners) {
    if (corner.border) {
      corner.elevation = 0;
      queue.push(corner);
    } else {
      corner.elevation = Infinity;
    }
  }

  while (queue.length) {
    const corner = queue.shift();
    if (!corner) throw new Error();

    for (const adjacentCorner of corner?.adjacent) {
      let newElevation = corner.elevation + 0.01;
      if (!corner.water && !adjacentCorner.water) newElevation += 1;

      if (newElevation < adjacentCorner.elevation) {
        adjacentCorner.elevation = newElevation;
        queue.push(adjacentCorner);
      }
    }
  }

  // Normalize.
  const SCALE_FACTOR = 1.1;
  const landCorners = ctx.corners
    .filter((c) => !c.water)
    .sort((a, b) => b.elevation - a.elevation);
  landCorners.forEach((corner, i) => {
    // Let y(x) be the total area that we want at elevation <= x.
    // We want the higher elevations to occur less than lower
    // ones, and set the area to be y(x) = 1 - (1-x)^2.
    const y = i / (landCorners.length - 1);
    // Now we have to solve for x, given the known y.
    //  *  y = 1 - (1-x)^2
    //  *  y = 1 - (1 - 2x + x^2)
    //  *  y = 2x - x^2
    //  *  x^2 - 2x + y = 0
    // From this we can use the quadratic equation to get:
    let x = Math.sqrt(SCALE_FACTOR) - Math.sqrt(SCALE_FACTOR * (1 - y));
    if (x > 1.0) x = 1.0;  // TODO: does this break downslopes?
    corner.elevation = x;
  });

  for (const polygon of ctx.polygons.values()) {
    polygon.center.elevation = polygon.corners.reduce((acc, cur) => acc + cur.elevation, 0) / polygon.corners.length;
  }
}

function setDownslope(ctx: Context) {
  for (const corner of ctx.corners) {
    let min = corner;
    for (const c of corner.adjacent) {
      if (min.elevation > c.elevation) min = c;
    }
    if (min !== corner) corner.downslope = min;
  }

  for (const corner of ctx.corners.sort((a, b) => b.elevation - a.elevation)) {
    if (!corner.downslope) continue;
    corner.downslope.upslope = corner;
  }
}

function setWatershed(ctx: Context) {
  for (const corner of ctx.corners) {
    if (corner.downslope && !corner.ocean && !corner.coast) {
      corner.watershed = corner.downslope;
    } else {
      corner.watershed = corner;
    }
  }

  // Follow the downslope pointers to the coast. Limit to 100
  // iterations although most of the time with numPoints==2000 it
  // only takes 20 iterations because most points are not far from
  // a coast.  TODO: can run faster by looking at
  // p.watershed.watershed instead of p.downslope.watershed.
  for (let i = 0; i < 100; i++) {
    let changed = false;
    for (const corner of ctx.corners) {
      if (!corner.downslope) continue;

      if (!corner.ocean && !corner.coast && !corner.watershed.coast) {
        if (!corner.downslope.watershed.ocean) {
          corner.watershed = corner.downslope.watershed;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (const corner of ctx.corners) {
    const watershed = corner.watershed;
    watershed.watershed_size = 1 + (watershed.watershed_size || 0);
  }
}

function createRivers(ctx: Context) {
  for (let i = 0; i < ctx.options.width * ctx.options.height / 2; i++) {
    let corner: Corner | undefined = ctx.corners[Math.floor(ctx.corners.length * ctx.random())];
    if (corner.ocean || corner.elevation < 0.3 || corner.elevation > 0.9) continue;

    while (corner && !corner.coast) {
      corner.river++;
      if (corner.downslope) corner.downslope.river++;  // TODO: fix double count
      corner = corner.downslope;
    }
  }
}

function setMoisture(ctx: Context) {
  const queue: Corner[] = [];
  // Fresh water
  for (const q of ctx.corners) {
    if ((q.water || q.river > 0) && !q.ocean) {
      q.moisture = q.river > 0 ? Math.min(3.0, (0.2 * q.river)) : 1.0;
      queue.push(q);
    } else {
      q.moisture = 0.0;
    }
  }

  while (queue.length > 0) {
    const q = queue.shift();
    if (!q) continue;

    for (const r of q.adjacent) {
      const newMoisture = q.moisture * 0.9;
      if (newMoisture > r.moisture) {
        r.moisture = newMoisture;
        queue.push(r);
      }
    }
  }

  // Evenly distribute.
  const landCorners = ctx.corners
    .filter((corner) => !corner.water)
    .sort((a, b) => b.moisture - a.moisture);
  landCorners.forEach((corner, i) => {
    corner.moisture = i / (landCorners.length - 1);
  });

  for (const polygon of ctx.polygons.values()) {
    polygon.center.moisture = polygon.corners.reduce((acc, cur) => acc + cur.moisture, 0) / polygon.corners.length;
  }
}

function getBiome(p: Center) {
  if (p.ocean) {
    return 'OCEAN';
  } else if (p.water) {
    if (p.elevation < 0.1) return 'MARSH';
    if (p.elevation > 0.8) return 'ICE';
    return 'LAKE';
  } else if (p.coast) {
    return 'BEACH';
  } else if (p.elevation > 0.8) {
    if (p.moisture > 0.50) return 'SNOW';
    else if (p.moisture > 0.33) return 'TUNDRA';
    else if (p.moisture > 0.16) return 'BARE';
    else return 'SCORCHED';
  } else if (p.elevation > 0.6) {
    if (p.moisture > 0.66) return 'TAIGA';
    else if (p.moisture > 0.33) return 'SHRUBLAND';
    else return 'TEMPERATE_DESERT';
  } else if (p.elevation > 0.3) {
    if (p.moisture > 0.83) return 'TEMPERATE_RAIN_FOREST';
    else if (p.moisture > 0.50) return 'TEMPERATE_DECIDUOUS_FOREST';
    else if (p.moisture > 0.16) return 'GRASSLAND';
    else return 'TEMPERATE_DESERT';
  } else {
    if (p.moisture > 0.66) return 'TROPICAL_RAIN_FOREST';
    else if (p.moisture > 0.33) return 'TROPICAL_SEASONAL_FOREST';
    else if (p.moisture > 0.16) return 'GRASSLAND';
    else return 'SUBTROPICAL_DESERT';
  }
}

export function generate(options: GenerateOptions) {
  const ctx = {
    options,
    random: Math.random,
    polygons: null as unknown as Map<Point, Polygon>,
    corners: null as unknown as Corner[],
  };
  const { partitionStrategy } = options;

  // Partition into polygons.
  if (partitionStrategy.type === 'square') {
    const partitionResult = squarePartition(partitionStrategy.size, partitionStrategy.rand || 0, ctx);
    ctx.polygons = partitionResult.polygons;
    ctx.corners = partitionResult.corners;
  } else {
    throw new Error();
  }

  setBorder(ctx);
  setWater(ctx);
  setOceanCoastAndLand(ctx);
  setElevation(ctx);
  setDownslope(ctx);
  setWatershed(ctx);
  createRivers(ctx);
  setMoisture(ctx);

  for (const polygon of ctx.polygons.values()) {
    polygon.center.biome = getBiome(polygon.center);
  }

  return ctx;
}
