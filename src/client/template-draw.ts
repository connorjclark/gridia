import { MINE, WATER } from '../constants';
import WorldMapPartition from '../world-map-partition';

export function getWaterFloor(partition: WorldMapPartition, point: PartitionPoint) {
  const templateIndex = useTemplate(partition, 0, WATER, point);
  return templateIndex;
}

export function getMineFloor(partition: WorldMapPartition, point: PartitionPoint) {
  const templateIndex = useTemplate(partition, 1, MINE, point);
  return templateIndex;
}

// generalize
// this is only for floors right now
// more uses?
function useTemplate(partition: WorldMapPartition, templateId: number, typeToMatch: number, loc: PartitionPoint) {
  const { x, y, z } = loc;
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

  function getTileOrFake(pos: PartitionPoint): Partial<{ floor: number }> {
    if (!partition.inBounds(pos)) {
      return { floor: typeToMatch };
    }
    return partition.getTile(pos);
  }

  const below = getTileOrFake({ x, y: yu, z }).floor === typeToMatch;
  const above = getTileOrFake({ x, y: yd, z }).floor === typeToMatch;
  const left = getTileOrFake({ x: xl, y, z }).floor === typeToMatch;
  const right = getTileOrFake({ x: xr, y, z }).floor === typeToMatch;

  const offset = templateId * 50;
  let v = (above ? 1 : 0) + (below ? 2 : 0) + (left ? 4 : 0) + (right ? 8 : 0);

  // this is where the complicated crap kicks in
  // i'd really like to replace this.
  // :'(
  // this is mostly guess work. I think. I wrote this code years ago. I know it works,
  // so I just copy and pasted. Shame on me.
  // ^ nov 2014
  // update: just copied this again here in dec 2018

  const downleft = getTileOrFake({ x: xl, y: yu, z }).floor === typeToMatch;
  const downright = getTileOrFake({ x: xr, y: yu, z }).floor === typeToMatch;
  const upleft = getTileOrFake({ x: xl, y: yd, z }).floor === typeToMatch;
  const upright = getTileOrFake({ x: xr, y: yd, z }).floor === typeToMatch;

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

  return v + offset;
}
