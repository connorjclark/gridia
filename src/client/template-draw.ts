import * as Content from '../content';
import {WorldMapPartition} from '../world-map-partition';

export function getIndexOffsetForTemplate(partition: WorldMapPartition,
                                          typeToMatch: number, loc: PartitionPoint,
                                          templateType: TemplateType, match: 'item' | 'floor') {
  if (templateType === 'bit-offset') {
    return useBitOffsetTemplate(partition, typeToMatch, loc, match);
  } else {
    const offset = useVisualOffsetTemplate(partition, typeToMatch, loc, match);
    const tilesAcross = Content.getBaseDir() === 'worlds/rpgwo-world' ? 10 : 8;
    return offset.x + offset.y * tilesAcross;
  }
}

function useVisualOffsetTemplate(partition: WorldMapPartition,
                                 typeToMatch: number, loc: PartitionPoint, match: 'item' | 'floor') {
  const {x, y, z} = loc;
  const xl = x - 1;
  const xr = x + 1;
  const yu = y + 1;
  const yd = y - 1;

  function matches(pos: PartitionPoint) {
    if (!partition.inBounds(pos)) {
      return true;
    }

    const tile = partition.getTile(pos);
    if (match === 'floor') return tile.floor === typeToMatch;

    return tile.item?.type === typeToMatch;
  }

  const below = matches({x, y: yu, z});
  const above = matches({x, y: yd, z});
  const left = matches({x: xl, y, z});
  const right = matches({x: xr, y, z});
  const downleft = matches({x: xl, y: yu, z});
  const downright = matches({x: xr, y: yu, z});
  const upleft = matches({x: xl, y: yd, z});
  const upright = matches({x: xr, y: yd, z});
  // @ts-expect-error: Boolean addition!
  const cardinalSum = below + above + left + right;
  // @ts-expect-error: Boolean addition!
  const sum = below + above + left + right + downleft + downright + upleft + upright;

  /*
      ____
     /....\
     |....|
     \____/
     see tileset_1bit.png
  */

  // Surrounded by matches, so using the visual center.
  if (sum === 8) return {x: 0, y: 0};

  // One of the diagonals don't match.
  if (cardinalSum === 4 && sum === 7) {
    // The tiles that have just a single unmatched corner are a little below and to the left.
    const o = {x: -1, y: 2};
    if (!downleft) o.x += 1;
    if (!downright) {
      // all good!
    }
    if (!upleft) {
      o.x += 1; o.y += 1;
    }
    if (!upright) o.y += 1;
    return o;
  }

  // Check for cardinal edges.
  if (!left && right && above && below) return {x: -1, y: 0};
  if (!right && left && above && below) return {x: 1, y: 0};
  if (!above && below && left && right) return {x: 0, y: -1};
  if (!below && above && left && right) return {x: 0, y: 1};

  // Check for corners.
  if (right && below && !above && !left) return {x: -1, y: -1};
  if (left && below && !above && !right) return {x: 1, y: -1};
  if (left && above && !right && !below) return {x: 1, y: 1};
  if (right && above && !left && !below) return {x: -1, y: 1};

  // Some other combination (is this even possible?), just consider all sides to be matching.
  return {x: 0, y: 0};
}

function useBitOffsetTemplate(partition: WorldMapPartition,
                              typeToMatch: number, loc: PartitionPoint, match: 'item' | 'floor') {
  const {x, y, z} = loc;
  // const width = client.world.width;
  // const height = client.world.height;
  // const xl = x == 0 ? width - 1 : x - 1;
  // const xr = x == width - 1 ? 0 : x + 1;
  // const yu = y == 0 ? height - 1 : y + 1;
  // const yd = y == height - 1 ? 0 : y - 1;
  const xl = x - 1;
  const xr = x + 1;
  const yu = y + 1;
  const yd = y - 1;

  function matches(pos: PartitionPoint) {
    if (!partition.inBounds(pos)) {
      return true;
    }

    const tile = partition.getTile(pos);
    if (match === 'floor') return tile.floor === typeToMatch;

    return tile.item?.type === typeToMatch;
  }

  const below = matches({x, y: yu, z});
  const above = matches({x, y: yd, z});
  const left = matches({x: xl, y, z});
  const right = matches({x: xr, y, z});

  let v = (above ? 1 : 0) + (below ? 2 : 0) + (left ? 4 : 0) + (right ? 8 : 0);

  // this is where the complicated crap kicks in
  // i'd really like to replace this.
  // :'(
  // this is mostly guess work. I think. I wrote this code years ago. I know it works,
  // so I just copy and pasted. Shame on me.
  // ^ nov 2014
  // update: just copied this again here in dec 2018

  const downleft = matches({x: xl, y: yu, z});
  const downright = matches({x: xr, y: yu, z});
  const upleft = matches({x: xl, y: yd, z});
  const upright = matches({x: xr, y: yd, z});

  if (v === 15) {
    if (!upleft) {
      v++;
    }
    if (!upright) {
      v += 2;
    }
    if (!downleft) {
      v += 4;
    }
    if (!downright) {
      v += 8;
    }
  } else if (v === 5) {
    if (!upleft) {
      v = 31;
    }
  } else if (v === 6) {
    if (!downleft) {
      v = 32;
    }
  } else if (v === 9) {
    if (!upright) {
      v = 33;
    }
  } else if (v === 10) {
    if (!downright) {
      v = 34;
    }
  } else if (v === 7) {
    if (!downleft || !upleft) {
      v = 34;
      if (!downleft) {
        v++;
      }
      if (!upleft) {
        v += 2;
      }
    }
  } else if (v === 11) {
    if (!downright || !upright) {
      v = 37;
      if (!downright) {
        v++;
      }
      if (!upright) {
        v += 2;
      }
    }
  } else if (v === 13) {
    if (!upright || !upleft) {
      v = 40;
      if (!upright) {
        v++;
      }
      if (!upleft) {
        v += 2;
      }
    }
  } else if (v === 14) {
    if (!downright || !downleft) {
      v = 43;
      if (!downright) {
        v++;
      }
      if (!downleft) {
        v += 2;
      }
    }
  }

  return v;
}
