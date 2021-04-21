/* eslint-disable max-len */
// npx ts-node --files src/lib/experiment-item-def-2.ts

function makeGraphicsFile(file: string) {
  return (arg: number | number[]) => {
    const frames = Array.isArray(arg) ? arg : [arg];
    return { file, frames };
  };
}
const Graphics = {
  none: { file: 'rpgwo-item0.png', frames: [0] },
  rpgwoItem: (arg: number | number[]) => {
    const arr = Array.isArray(arg) ? arg : [arg];
    const index = Math.floor(arr[0] / 100);
    return makeGraphicsFile(`rpgwo-item${Math.floor(index)}.png`)(arr.map((i) => i % 100));
  },
  general: makeGraphicsFile('general.png'),
  armor: makeGraphicsFile('armor.png'),
  weapon: makeGraphicsFile('weapon.png'),
};

const result = {
  items: [] as MetaItem[],
  usages: [] as ItemUse[],
};

// TODO
const assignedItemIds: Record<string, number> = {};
let nextItemId = 1;
for (const id of Object.values(assignedItemIds)) {
  nextItemId = Math.max(nextItemId, id + 1);
}

type ItemOpts = Pick<MetaItem, 'name' | 'graphics'> & Partial<MetaItem>;
function item(partial: ItemOpts) {
  let id = assignedItemIds[partial.name];
  if (id === undefined) id = nextItemId++;

  const item_: MetaItem = {
    id,
    class: 'Normal' as const,
    burden: 1,
    rarity: 1,
    light: 0,
    stackable: true,
    walkable: true,
    moveable: true,
    blocksLight: false,
    ...partial,
  };
  result.items.push(item_);
  return item_;
}

function q(item_: MetaItem, quantity: number) {
  return { ...item_, quantity: Math.floor(quantity) };
}

interface TickOpts {
  time: string;
}
function tick(from: MetaItem, to: MetaItem, opts: TickOpts) {
  from.growthItem = to.id;
  from.growthDelta = 1; // TODO
}

type UsageOpts = Partial<Omit<ItemUse, 'tool' | 'focus' | 'products'>> & {
  products: Array<MetaItem & { quantity?: number }>;
};
function usage(tool: MetaItem, focus: MetaItem, { products, ...opts }: UsageOpts) {
  result.usages.push({
    tool: tool.id,
    toolQuantityConsumed: 0,
    focus: focus.id,
    focusQuantityConsumed: 0,
    products: products.map((p) => {
      return {
        type: p.id,
        quantity: p.quantity || 1,
      };
    }),
    successMessage: `You successfully used ${tool.name} on ${focus.name}`,
    ...opts,
  });
}

interface Graphic {
  file: string;
  frames: number[];
}

function sortObject(object: any, explicitOrder: string[]) {
  const sorted: any = {};

  const keys = Object.keys(object).sort((a, b) => {
    const orderA = explicitOrder.indexOf(a);
    const orderB = explicitOrder.indexOf(b);

    if (orderA === -1 && orderB !== -1) {
      return 1;
    }
    if (orderA !== -1 && orderB === -1) {
      return -1;
    }
    if (orderA !== -1 && orderB !== -1) {
      return orderA - orderB;
    }

    return a.localeCompare(b);
  });

  for (const key of keys) {
    sorted[key] = object[key];
  }

  return sorted;
}

function fillGaps(objects: any[]) {
  const noGaps = [];

  objects = [...objects];

  while (objects.length) {
    if (objects[0].id === noGaps.length) {
      noGaps.push(objects.splice(0, 1)[0]);
    } else {
      noGaps.push(null);
    }
  }

  return noGaps;
}

// ---------------------

const anvil = item({ name: 'Anvil', graphics: Graphics.general(10) });
const axe = item({ name: 'Axe', graphics: Graphics.general(10) });
const ploughed = item({ name: 'Ploughed Ground', graphics: Graphics.general(10) });
const branches = item({ name: 'Branches', graphics: Graphics.general(10) });
const gold = item({ name: 'Gold', graphics: Graphics.general(10) });
const hand = item({ name: 'Hand', graphics: Graphics.none });
const logs = item({ name: 'Logs', graphics: Graphics.general(10) });
const orange = item({ name: 'Orange', graphics: Graphics.general(10) });

const fireStarter = item({ name: 'Fire Starter', graphics: Graphics.rpgwoItem(150) });
const unlitTorch = item({ name: 'Unlit Torch', graphics: Graphics.general(18 * 20) });
const litTorch = item({ name: 'Lit Torch', graphics: Graphics.general(18 * 20 + 1) });
usage(fireStarter, unlitTorch, { products: [litTorch] });

interface TreeOpts {
  name: string;
  product: MetaItem;
  yield: number;
  flowering: { graphics: Graphic };
  ripening: { graphics: Graphic };
  ripe: { graphics: Graphic };
  dormant: { graphics: Graphic };
}
const Tree = (opts: TreeOpts) => {
  const seeds = item({ name: `${opts.name} Seeds`, graphics: Graphics.general(123) });
  const stump = item({ name: `${opts.name} Tree Stump`, graphics: Graphics.general(123) });
  const sprouting = item({ name: `Sprouting ${opts.name} Tree`, graphics: Graphics.general(895) });
  const young = item({ name: `Young ${opts.name} Tree`, graphics: Graphics.general(896) });
  const flowering = item({ name: `Flowering ${opts.name} Tree`, ...opts.flowering });
  const ripening = item({ name: `Ripening ${opts.name} Tree`, ...opts.ripening });
  const ripe = item({ name: `Ripe ${opts.name} Tree`, ...opts.ripe });
  const dormant = item({ name: `Dormant ${opts.name} Tree`, ...opts.dormant });

  tick(stump, sprouting, { time: '10 days' });
  tick(sprouting, young, { time: '1 day' });
  tick(young, flowering, { time: '1 day' });
  tick(flowering, ripening, { time: '1 day' });
  tick(ripening, ripe, { time: '6 hours' });
  tick(ripe, dormant, { time: '2 days' });

  usage(seeds, ploughed, { products: [sprouting] });
  usage(hand, ripe, {
    products: [q(opts.product, opts.yield)],
  });
  usage(axe, sprouting, { products: [stump, branches] });
  usage(axe, young, { products: [stump, logs, branches] });
  for (const focus of [flowering, ripening, dormant]) {
    usage(axe, focus, { products: [stump, q(logs, 2), q(branches, 2)] });
  }
  usage(axe, ripe, { products: [stump, q(logs, 2), q(branches, 2), q(opts.product, opts.yield / 2)] });

  return {
    seeds,
    stump,
    sprouting,
    young,
    flowering,
    ripening,
    ripe,
    dormant,
  };
};

Tree({
  name: 'Orange',
  product: orange,
  yield: 5,
  flowering: { graphics: Graphics.general(123) },
  ripening: { graphics: Graphics.general(123) },
  ripe: { graphics: Graphics.general(123) },
  dormant: { graphics: Graphics.general(123) },
});

Tree({
  name: 'Gold',
  product: gold,
  yield: 100,
  flowering: { graphics: Graphics.general(123) },
  ripening: { graphics: Graphics.general(123) },
  ripe: { graphics: Graphics.general(123) },
  dormant: { graphics: Graphics.general(123) },
});

interface OreOpts {
  name: string;
  oreGraphics: Graphic;
  barGraphics: Graphic;
}
const Ore = (opts: OreOpts) => {
  const ore = item({ name: `${opts.name} Ore`, graphics: opts.oreGraphics, class: 'Ore' });
  const bar = item({ name: `${opts.name} Bar`, graphics: opts.barGraphics });

  return {
    name: opts.name,
    ore,
    bar,
  };
};

const ores = {
  copper: Ore({ name: 'Copper', oreGraphics: Graphics.general(40), barGraphics: Graphics.general(42) }),
  silver: Ore({ name: 'Silver', oreGraphics: Graphics.general(80), barGraphics: Graphics.general(82) }),
  gold: Ore({ name: 'Gold', oreGraphics: Graphics.general(120), barGraphics: Graphics.general(122) }),
  magma: Ore({ name: 'Magma', oreGraphics: Graphics.general(200), barGraphics: Graphics.general(202) }),
};

interface ArmorOpts {
  name: string;
  material: MetaItem;
  lightHelment: { graphics: Graphics };
  lightChest: { graphics: Graphics };
  lightLeggings: { graphics: Graphics };
  // lightBoots: { graphics: Graphics };
}
const Armor = (opts: ArmorOpts) => {
  const lightHelment = item({ name: `Light ${opts.name} Helment`, class: 'Armor', equipSlot: 'Head', ...opts.lightHelment });
  const lightChest = item({ name: `Light ${opts.name} Chestplate`, class: 'Armor', equipSlot: 'Chest', ...opts.lightChest });
  const lightLeggings = item({ name: `Light ${opts.name} Leggings`, class: 'Armor', equipSlot: 'Legs', ...opts.lightChest });
  // const lightBoots = item({ name: `Light ${opts.name} Boots`, class: 'Armor', equipSlot: 'Feet', ...opts.lightChest });

  usage(opts.material, anvil, { skill: 'Smithing', toolQuantityConsumed: 5, products: [lightHelment] });
  usage(opts.material, anvil, { skill: 'Smithing', toolQuantityConsumed: 8, products: [lightChest] });
  usage(opts.material, anvil, { skill: 'Smithing', toolQuantityConsumed: 6, products: [lightLeggings] });
  // usage(opts.material, anvil, { skill: 'Smithing', toolQuantityConsumed: 3, products: [lightBoots] });

  return {
    lightHelment,
    lightChest,
    lightLeggings,
    // lightBoots,
  };
};

for (const [key, [name, ore]] of Object.entries((Object.entries(ores)))) {
  const index = Number(key);
  const offset = index * 120;
  Armor({
    name,
    material: ore.bar,
    lightHelment: { graphics: Graphics.armor(offset) },
    lightChest: { graphics: Graphics.armor(offset + 20) },
    lightLeggings: { graphics: Graphics.armor(offset + 40) },
    // lightBoots: { graphics: Graphics.armor(offset + 60) },
  });
}

const weaponMaterials = [ores.copper];
for (const material of weaponMaterials) {
  const name = material.name;
  const offset = 12 * 20;
  const dagger = item({ name: `${name} Dagger`, graphics: Graphics.weapon(offset), class: 'Weapon', equipSlot: 'Weapon' });
  const cutlass = item({ name: `${name} Cutlass`, graphics: Graphics.weapon(offset + 1), class: 'Weapon', equipSlot: 'Weapon' });
  const broadsword = item({ name: `${name} Broadsword`, graphics: Graphics.weapon(offset + 2), class: 'Weapon', equipSlot: 'Weapon' });
  const spear = item({ name: `${name} Spear`, graphics: Graphics.weapon(offset + 3), class: 'Weapon', equipSlot: 'Weapon' });
  const trident = item({ name: `${name} Trident`, graphics: Graphics.weapon(offset + 5), class: 'Weapon', equipSlot: 'Weapon' });
  const magicStaff = item({ name: `${name} Magic Staff`, graphics: Graphics.weapon(offset + 6), class: 'Weapon', equipSlot: 'Weapon' });

  usage(material.bar, anvil, { skill: 'Smithing', toolQuantityConsumed: 5, products: [dagger] });
}

// -------------

result.items = result.items.map((item_) => sortObject(item_, ['id', 'name', 'class']));
result.items = fillGaps(result.items);
result.usages = result.usages.map((usage_) => sortObject(usage_, ['tool', 'focus', 'skill']));
result.usages.sort((a, b) => {
  if (a.tool > b.tool) return 1;
  if (a.tool < b.tool) return -1;

  if (a.focus > b.focus) return 1;
  if (a.focus < b.focus) return -1;

  return 0;
});
console.log(JSON.stringify(result, null, 2));
