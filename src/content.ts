import {setGfxSize} from './constants';
import {ATTRIBUTES} from './player';
import {randInt} from './utils';

interface WorldData {
  floors: MetaFloor[];
  items: MetaItem[];
  itemUses: ItemUse[];
  animations: GridiaAnimation[];
  monsters: Monster[];
  skills: Skill[];
  spells: Spell[];
  lootTables: Record<string, LootTable>;
}

const isNode = typeof process !== 'undefined' && process.release && process.release.name === 'node';

let worldDataDef: WorldDataDefinition;
let data: WorldData = {
  floors: [],
  items: [],
  itemUses: [],
  animations: [],
  monsters: [],
  skills: [],
  spells: [],
  lootTables: {},
};
export async function initializeWorldData(worldDataDef_: WorldDataDefinition): Promise<void> {
  worldDataDef = worldDataDef_;

  let floors: MetaFloor[] = [];
  let items: MetaItem[] = [];
  let itemUses: ItemUse[] = [];
  let animations: GridiaAnimation[] = [];
  let monsters: Monster[] = [];
  let skills: Skill[] = [];
  let spells: Spell[] = [];
  let lootTables: Record<string, LootTable> = {};

  async function loadDataFile(pathRelativeToRoot: string) {
    if (isNode) {
      return require('../' + pathRelativeToRoot);
    }

    return fetch(pathRelativeToRoot).then((r) => r.json());
  }

  if (worldDataDef_.baseDir === 'worlds/rpgwo-world') {
    [floors, items, itemUses, animations, monsters, skills, spells, lootTables] = await Promise.all([
      loadDataFile('worlds/rpgwo-world/content/floors.json'),
      loadDataFile('worlds/rpgwo-world/content/items.json'),
      loadDataFile('worlds/rpgwo-world/content/itemuses.json'),
      loadDataFile('worlds/rpgwo-world/content/animations.json'),
      loadDataFile('worlds/rpgwo-world/content/monsters.json'),
      loadDataFile('worlds/rpgwo-world/content/skills.json'),
      loadDataFile('worlds/rpgwo-world/content/spells.json'),
      loadDataFile('worlds/rpgwo-world/content/lootTables.json'),
    ]);
  } else if (worldDataDef_.baseDir === 'worlds/bit-world') {
    function addItem(item: Partial<MetaItem>, x?: number, y?: number) {
      const graphics = x !== undefined && y !== undefined ?
        {file: 'tileset_1bit.png', frames: [x + y * 8]} :
        {file: 'tileset_1bit.png', frames: [63]};
      items.push({
        id: items.length,
        name: 'Unnamed item',
        class: 'Normal',
        graphics,
        burden: 0,
        stackable: false,
        moveable: true,
        walkable: true,
        light: 0,
        blocksLight: false,
        rarity: 0,
        ...item,
      });
    }

    addItem({name: 'Nothing'});
    addItem({name: 'Block', walkable: false}, 0, 0);
    addItem({name: 'Wood Wall', walkable: false}, 1, 0);
    addItem({name: 'Block', walkable: false}, 2, 0);
    addItem({name: 'Brick Wall', walkable: false}, 3, 0);
    addItem({name: 'Ore', class: 'Ore', rarity: 1}, 6, 0);
    addItem({name: 'Tree', walkable: false}, 7, 0);
    addItem({name: 'Palm Tree', walkable: false}, 7, 1);

    /* eslint-disable max-len */
    floors = [
      {id: 0, graphics: {file: 'tileset_1bit.png', frames: [63]}, color: '0xffffff'},
      {id: 1, graphics: {file: 'tileset_1bit.png', frames: [2*8 + 1], templateType: 'visual-offset'}, color: '0x0000bb'},
      {id: 2, graphics: {file: 'tileset_1bit.png', frames: [6]}, color: '0x00ff00'},
    ];
    /* eslint-enable max-len */

    skills = await loadDataFile('worlds/rpgwo-world/content/skills.json');
  }

  data = {
    floors,
    items,
    itemUses,
    animations,
    monsters,
    skills,
    spells,
    lootTables,
  };

  setGfxSize(worldDataDef_.tileSize);

  // Tweak some things.

  data.items = items.map((item, i) => {
    return item || {
      id: i,
      name: 'Unknown',
      burden: 0,
      walkable: true,
      light: 0,
      moveable: true,
      stackable: false,
    };
  });

  for (const animation of animations) {
    for (const frame of animation.frames) {
      if (frame.sound) frame.sound = frame.sound.toLowerCase();
    }
  }

  for (const use of itemUses) {
    // @ts-ignore
    use.toolName = getName(use.tool);
    // @ts-ignore
    use.focusName = getName(use.focus);
    // @ts-ignore
    use.productNames = use.products.map((product) => getName(product.type));
  }

  // @ts-ignore
  // globalThis.GridiaContent = {items, itemUses, animations, monsters, skills};
}

// TODO: this json is bundled as JS - but it's much faster to parse
// JSON at runtime via JSON.parse than as a JS object literal.
// https://github.com/parcel-bundler/parcel/issues/501

// Parcel doesn't support dynamic imports for workers yet.
// Until then, we do this hack to at least cut the content data out
// of the web client bundle. Parcel 2 will support this.

// Only the node server entry / tests uses this.
// function loadContentFromDisk() {
//   // Make the path dynamically so parcel doesn't bundle the data.
//   const prefix = '../world/content';

//   [floors, items, itemUses, animations, monsters, skills, spells, lootTables] = [
//     require(`${prefix}/floors.json`),
//     require(`${prefix}/items.json`),
//     require(`${prefix}/itemuses.json`),
//     require(`${prefix}/animations.json`),
//     require(`${prefix}/monsters.json`),
//     require(`${prefix}/skills.json`),
//     require(`${prefix}/spells.json`),
//     require(`${prefix}/lootTables.json`),
//   ];
//   prepareData();
// }

// Web client and worker entry uses this.
// export async function loadContentFromNetwork() {
//   // @ts-ignore
//   [floors, items, itemUses, animations, monsters, skills, spells, lootTables] = await Promise.all([
//     fetch('world/content/floors.json').then((r) => r.json()),
//     fetch('world/content/items.json').then((r) => r.json()),
//     fetch('world/content/itemuses.json').then((r) => r.json()),
//     fetch('world/content/animations.json').then((r) => r.json()),
//     fetch('world/content/monsters.json').then((r) => r.json()),
//     fetch('world/content/skills.json').then((r) => r.json()),
//     fetch('world/content/spells.json').then((r) => r.json()),
//     fetch('world/content/lootTables.json').then((r) => r.json()),
//   ]);
//   prepareData();
// }

// if (typeof process !== 'undefined' && process.release && process.release.name === 'node') {
//   loadContentFromDisk();
// }

// Add name properties for readability in the console.
function getName(id: number) {
  if (id === -1) return 'Hand';
  return getMetaItem(id).name;
}

export class ItemWrapper {
  constructor(public type: number, public quantity: number) { }

  raw(): Item | undefined {
    if (this.type === 0) return;
    return {type: this.type, quantity: this.quantity};
  }

  remove(quantity: number) {
    this.quantity -= quantity;
    if (this.quantity <= 0) {
      this.quantity = 0;
      this.type = 0;
    }

    return this;
  }

  clone() {
    return new ItemWrapper(this.type, this.quantity);
  }
}

export function getBaseDir() {
  return worldDataDef.baseDir;
}

export function getTileSize() {
  return worldDataDef.tileSize;
}

export function getFloors() {
  return data.floors;
}

export function getMetaFloor(id: number): MetaFloor {
  return data.floors[id];
}

export function getMetaItems(): MetaItem[] {
  return data.items;
}

export function getMetaItem(id: number): MetaItem {
  return data.items[id];
}

export function getMetaItemByName(name: string): MetaItem {
  const lowerCaseName = name.toLowerCase();
  const result = data.items.find((item) => Boolean(item && item.name.toLowerCase() === lowerCaseName));
  if (!result) throw new Error(`could not find item: ${name}`);
  return result;
}

export function findMetaItemByName(name: string): MetaItem | undefined {
  const lowerCaseName = name.toLowerCase();
  const result = data.items.find((item) => Boolean(item && item.name.toLowerCase() === lowerCaseName));
  return result;
}

export function getAllItemUses() {
  return data.itemUses;
}

export function getItemUses(tool: number, focus: number) {
  return data.itemUses.filter((item) => item.tool === tool && item.focus === focus);
}

export function getItemUsesForTool(tool: number) {
  const usagesGroupedByFocus = new Map<number, ItemUse[]>();

  for (const itemUse of data.itemUses) {
    if (itemUse.tool === tool) {
      const usages = usagesGroupedByFocus.get(itemUse.focus) || [];
      usages.push(itemUse);
      usagesGroupedByFocus.set(itemUse.focus, usages);
    }
  }

  return usagesGroupedByFocus;
}

export function getItemUsesForFocus(focus: number) {
  return data.itemUses.filter((item) => item.focus === focus);
}

export function getItemUsesForProduct(type: number) {
  return data.itemUses.filter(
    (item) => item.successTool === type || item.products.some((product) => product.type === type));
}

function getMetaItemsOfClass(itemClass: MetaItem['class']): MetaItem[] {
  return data.items.filter((item) => Boolean(item && item.class === itemClass));
}

// Weighted by rarity.
export function getRandomMetaItemOfClass(itemClass: MetaItem['class']) {
  const itemsOfClass = getMetaItemsOfClass(itemClass);
  const maxRarity = itemsOfClass.reduce((acc, item) => acc + item.rarity, 0);
  const value = Math.random() * maxRarity;

  let sumSoFar = 0;
  for (const item of itemsOfClass) {
    sumSoFar += item.rarity;
    if (value < sumSoFar) return item;
  }

  console.log({itemClass});

  // Shouldn't ever reach here.
  console.error('unexpected behavior in getRandomMetaItemOfClass.');
  return itemsOfClass[Math.floor(Math.random() * itemsOfClass.length)];
}

export function getAnimation(key: string) {
  return data.animations.find((a) => a.name === key);
}

export function getAnimationByIndex(index: number) {
  return data.animations[index];
}

export function getMonsterTemplate(id: number) {
  return data.monsters[id];
}

export function getRandomMonsterTemplate() {
  const id = randInt(0, data.monsters.length - 1);
  return data.monsters[id];
}

export function getMonsterTemplateByName(name: string) {
  const result = data.monsters.find((m) => m && m.name === name);
  if (!result) throw new Error(`could not find monster: ${name}`);
  return result;
}

// TODO
export function getMonsterTemplateByNameNoError(name: string) {
  return data.monsters.find((m) => m && m.name === name);
}

export function getSkills() {
  return data.skills;
}

export function getSkill(id: number) {
  return data.skills[id - 1];
}

export function getSkillByName(name: string) {
  return data.skills.find((s) => s.name === name);
}

// TODO make default behavior?
export function getSkillByNameOrThrowError(name: string) {
  const skill = data.skills.find((s) => s.name === name);
  if (!skill) throw new Error('no skill named ' + name);
  return skill;
}

export function getSkillAttributeDescription(skill: Skill) {
  const parts = [];

  for (const key of ATTRIBUTES) {
    // @ts-expect-error
    const multiplier = skill[key] || 0;
    if (!multiplier) continue;

    const abrv = key.substr(0, 3).toUpperCase();
    if (multiplier === 1) {
      parts.push(abrv);
    } else {
      parts.push(`${multiplier} * ${abrv}`);
    }
  }

  if (skill.divisor === 1) return parts.join(' + ');
  return `(${parts.join(' + ')}) / ${skill.divisor}`;
}

export function getSpells() {
  return data.spells;
}

export function getSpell(id: number) {
  return data.spells[id];
}

export function getLootTables() {
  return data.lootTables;
}
