export function roll(loot: LootTable, namedLootTables: Record<string, LootTable>) {
  const result: Item[] = [];
  roll_(loot, namedLootTables, result);
  return result;
}

function roll_(loot: LootTable | DropTableEntry, namedLootTables: Record<string, LootTable>, result: Item[]) {
  if (Array.isArray(loot)) {
    for (const entry of loot) {
      roll_(entry, namedLootTables, result);
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
        roll_(value, namedLootTables, result);
        break;
      }
    }
  } else if ('type' in loot && loot.type === 'ref') {
    const refLoot = namedLootTables[loot.id];
    if (!refLoot) throw new Error('unknown loot ref: ' + loot.id);

    for (let i = 0; i < (loot.quantity || 1); i++) {
      roll_(refLoot, namedLootTables, result);
    }
  } else {
    result.push({type: loot.type, quantity: loot.quantity || 1});
  }

  return result;
}
