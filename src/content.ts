// TODO: this json is bundled as JS - but it's much faster to parse
// JSON at runtime via JSON.parse than as a JS object literal.
// https://github.com/parcel-bundler/parcel/issues/501
let items: MetaItem[] = [];
let itemUses: ItemUse[] = [];
let animations: Animation[] = [];
let monsters: Monster[] = [];
let skills: Skill[] = [];

// Parcel doesn't support dynamic imports for workers yet.
// Until then, we do this hack to at least cut the content data out
// of the web client code. Parcel 2 will support this.

// Only the node server entry / tests uses this.
function loadContentFromDisk() {
  // Make the path dynamically so parcel doesn't bundle the data.
  const prefix = '../world/content';

  [items, itemUses, animations, monsters, skills] = [
    require(`${prefix}/items.json`),
    require(`${prefix}/itemuses.json`),
    require(`${prefix}/animations.json`),
    require(`${prefix}/monsters.json`),
    require(`${prefix}/skills.json`),
  ];
  prepareData();
}

// Web client and worker entry uses this.
export async function loadContentFromNetwork() {
  // @ts-ignore
  [items, itemUses, animations, monsters, skills] = await Promise.all([
    fetch('world/content/items.json').then((r) => r.json()),
    fetch('world/content/itemuses.json').then((r) => r.json()),
    fetch('world/content/animations.json').then((r) => r.json()),
    fetch('world/content/monsters.json').then((r) => r.json()),
    fetch('world/content/skills.json').then((r) => r.json()),
  ]);
  prepareData();
}

if (typeof process !== 'undefined' && process.release && process.release.name === 'node') {
  loadContentFromDisk();
}

function prepareData() {
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

  for (const monster of monsters) {
    if (monster) monster.image -= 1;
  }

  // @ts-ignore
  // globalThis.GridiaContent = {items, itemUses, animations, monsters, skills};
}

// Add name properties for readability in the console.
function getName(id: number) {
  if (id === -1) return 'Hand';
  return getMetaItem(id).name;
}

export class ItemWrapper {
  constructor(public type: number, public quantity: number) { }

  public raw(): Item | undefined {
    if (this.type === 0) return;
    return { type: this.type, quantity: this.quantity };
  }

  public remove(quantity: number) {
    this.quantity -= quantity;
    if (this.quantity <= 0) {
      this.quantity = 0;
      this.type = 0;
    }

    return this;
  }

  public clone() {
    return new ItemWrapper(this.type, this.quantity);
  }
}

export function getFloors(): number[] {
  const floors = new Array(600);
  for (let i = 0; i < floors.length; i++) floors[i] = i;
  return floors;
}

export function getMetaItems(): MetaItem[] {
  return items;
}

export function getMetaItem(id: number): MetaItem {
  return items[id];
}

export function getMetaItemByName(name: string): MetaItem {
  const lowerCaseName = name.toLowerCase();
  const result = items.find((item) => Boolean(item && item.name.toLowerCase() === lowerCaseName));
  if (!result) throw new Error(`could not find item: ${name}`);
  return result;
}

export function getItemUses(tool: number, focus: number) {
  return itemUses.filter((item) => item.tool === tool && item.focus === focus);
}

export function getItemUsesForTool(tool: number) {
  return itemUses.filter((item) => item.tool === tool);
}

export function getItemUsesForFocus(focus: number) {
  return itemUses.filter((item) => item.focus === focus);
}

export function getItemUsesForProduct(type: number) {
  return itemUses.filter((item) => {
    return item.successTool === type || item.products.some((product) => product.type === type);
  });
}

function getMetaItemsOfClass(itemClass: MetaItem['class']): MetaItem[] {
  return items.filter((item) => Boolean(item && item.class === itemClass));
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

  // Shouldn't ever reach here.
  console.error('unexpected behavior in getRandomMetaItemOfClass.');
  return itemsOfClass[Math.floor(Math.random() * itemsOfClass.length)];
}

export function getAnimation(key: string) {
  return animations.find((a) => a.name === key);
}

export function getMonsterTemplate(id: number) {
  return monsters[id];
}

export function getMonsterTemplateByName(name: string) {
  const result = monsters.find((m) => m && m.name === name);
  if (!result) throw new Error(`could not find monster: ${name}`);
  return result;
}

export function getSkills() {
  return skills;
}

export function getSkill(id: number) {
  return skills[id];
}
