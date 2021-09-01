import { getMetaItemByName } from '../content';

interface DropTableEntryBase {
  /** 0-100. Defaults to 100. */
  chance?: number;
}

interface DropTableRef extends DropTableEntryBase {
  type: 'ref';
  id: string;
}

interface DropTableOneOf extends DropTableEntryBase {
  type: 'one-of';
  values: DropTableEntry[];
}

interface DropTableValue extends DropTableEntryBase {
  itemType: number;
  itemQuantity?: number;
}

type DropTableEntry = DropTableRef | DropTableOneOf | DropTableValue;
export type LootTable = DropTableEntry | DropTableEntry[];

const foodLoot: LootTable = {
  type: 'one-of',
  values: [
    { itemType: getMetaItemByName('Red Apple').id },
    { itemType: getMetaItemByName('Banana').id },
  ],
};

const namedLoots = new Map<string, LootTable>();
export function registerLoot(id: string, loot: LootTable) {
  namedLoots.set(id, loot);
}

export function roll(loot: LootTable) {
  const result: Item[] = [];
  roll_(loot, result);
  return result;
}

function roll_(loot: LootTable, result: Item[]) {
  if (Array.isArray(loot)) {
    for (const entry of loot) {
      result.push(...roll(entry));
    }
    return;
  }

  if (loot.chance !== undefined) {
    if (Math.random() * 100 > loot.chance) return;
  }

  if ('type' in loot && loot.type === 'one-of') {
    const sum = loot.values.reduce((acc, item) => acc + (item.chance || 1), 0);
    const rolledValue = Math.random() * sum;

    let sumSoFar = 0;
    for (const value of loot.values) {
      sumSoFar += value.chance || 1;
      if (rolledValue < sumSoFar) {
        roll_(value, result);
        break;
      }
    }
  } else if ('type' in loot && loot.type === 'ref') {
    const refLoot = namedLoots.get(loot.id);
    if (!refLoot) throw new Error('unknown loot ref: ' + loot.id);
    roll_(refLoot, result);
  } else {
    result.push({type: loot.itemType, quantity: loot.itemQuantity || 1});
  }

  return result;
}

// TODO: remove
registerLoot('food', foodLoot);
