import * as assert from 'assert';
import {MINE, SECTOR_SIZE} from './constants';
import { getMetaItemByName } from './items';
import { ServerWorldContext } from './server/serverWorldContext';

export default function mapgen(width: number, height: number, depth: number, bare: boolean) {
  assert.ok(width % SECTOR_SIZE === 0);
  assert.ok(height % SECTOR_SIZE === 0);
  assert.ok(width < 1000);
  assert.ok(height < 1000);
  assert.ok(depth < 10);

  const treeType = getMetaItemByName('Pine Tree').id;
  const flowerType = getMetaItemByName('Cut Red Rose').id;

  const world = new ServerWorldContext(width, height, depth);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        const loc = { x, y, z };
        if (bare) {
          world.setTile(loc, {
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

          world.setTile(loc, {
            floor,
            item,
          });
        }
      }
    }
  }

  if (!bare) {
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
      world.getTile({ x: startX, y, z: 0 }).item = { type: tool, quantity: 1 };
      const focusItems = [...new Set(uses.map((u) => u.focus))];
      for (let j = 0; j < focusItems.length; j++) {
        world.getTile({ x: startX + j + 2, y, z: 0 }).item = { type: focusItems[j], quantity: 1 };
      }
      i++;
    }
  }

  return world;
}
