import * as assert from 'assert';
import {MINE, SECTOR_SIZE} from './constants';
import { getMetaItemByName } from './items';
import WorldMap from './world-map';

export default function mapgen(width: number, height: number, depth: number, bare: boolean) {
  assert.ok(width % SECTOR_SIZE === 0);
  assert.ok(height % SECTOR_SIZE === 0);
  assert.ok(width < 1000);
  assert.ok(height < 1000);
  assert.ok(depth < 10);

  const treeType = getMetaItemByName('Pine Tree').id;
  const flowerType = getMetaItemByName('Cut Red Rose').id;

  const map = new WorldMap(width, height, depth);

  // tslint:disable-next-line: prefer-for-of
  for (let sx = 0; sx < map.sectors.length; sx++) {
    for (let sy = 0; sy < map.sectors[0].length; sy++) {
      for (let sz = 0; sz < map.sectors[0][0].length; sz++) {
        map.sectors[sx][sy][sz] = map.createEmptySector();
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        const loc = { x, y, z };
        if (bare) {
          map.setTile(loc, {
            floor: z ? MINE : 100,
            item: null,
          });
        } else {
          let floor = 0;
          let item = null;

          if (z === 0) {
            floor = 100 + ((x + y) % 10) * 20;

            if (x === y) {
              item = {
                type: treeType,
                quantity: 1,
              };
            }

            if (x === y - 1) {
              item = {
                type: flowerType,
                quantity: 1,
              };
            }
          } else {
            floor = Math.random() > 0.2 ? MINE : 19;
          }

          map.setTile(loc, {
            floor,
            item,
          });
        }
      }
    }
  }

  if (!bare) {
    // Item playground.
    const itemUsesGroupedByTool = new Map<number, ItemUse[]>();
    for (const use of require('../world/content/itemuses.json') as ItemUse[]) {
      let arr = itemUsesGroupedByTool.get(use.tool);
      if (!arr) {
        itemUsesGroupedByTool.set(use.tool, arr = []);
      }
      arr.push(use);
    }
    let i = 0;
    for (const [tool, uses] of Array.from(itemUsesGroupedByTool.entries()).sort(([_, a], [__, b]) => {
      return b.length - a.length;
    }).slice(0, 30)) {
      const startX = 25;
      const y = i * 3;
      map.getTile({ x: startX, y, z: 0 }).item = { type: tool, quantity: 1 };
      const focusItems = [...new Set(uses.map((u) => u.focus))];
      for (let j = 0; j < focusItems.length; j++) {
        map.getTile({ x: startX + j + 2, y, z: 0 }).item = { type: focusItems[j], quantity: 1 };
      }
      i++;
    }

    // Some stairs.
    const loc = {x: 5, y: 5, z: 0};
    map.getTile({...loc, z: 1}).floor = map.getTile(loc).floor = 10;
    map.getTile({...loc, z: 1}).item = {
      type: getMetaItemByName('Royal Stairs Up').id,
      quantity: 1,
    };
    map.getTile(loc).item = {
      type: getMetaItemByName('Royal Stairs Down').id,
      quantity: 1,
    };
  }

  return map;
}
