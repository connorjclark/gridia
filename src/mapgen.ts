import * as assert from 'assert';
import { getMetaItemByName } from './items';
import { ServerWorldContext } from './server/serverWorldContext';

const SECTOR_SIZE = 20;

export default function mapgen(width: number, height: number, depth: number) {
  assert.ok(width % SECTOR_SIZE === 0);
  assert.ok(height % SECTOR_SIZE === 0);
  assert.ok(depth === 1);

  const treeType = getMetaItemByName('Pine Tree').id;
  const flowerType = getMetaItemByName('Cut Red Rose').id;

  const world = new ServerWorldContext(width, height);
  const bare = false;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const loc = { x, y };
      if (bare) {
        world.setTile(loc, {
          floor: 100,
          item: null,
        });
      } else {
        let item = null;

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

        world.setTile(loc, {
          floor: 100 + ((x + y) % 10) * 20,
          item,
        });
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
      world.getTile({ x: startX, y }).item = { type: tool, quantity: 1 };
      const focusItems = [...new Set(uses.map((u) => u.focus))];
      for (let j = 0; j < focusItems.length; j++) {
        world.getTile({ x: startX + j + 2, y }).item = { type: focusItems[j], quantity: 1 };
      }
      i++;
    }
  }

  return world;
}
