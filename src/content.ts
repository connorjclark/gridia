import {setGfxSize} from './constants.js';
import * as Utils from './utils.js';

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

export const WORLD_DATA_DEFINITIONS: Record<string, WorldDataDefinition> = {
  rpgwo: {
    baseDir: 'worlds/rpgwo-world',
    spritesheets: [
      'rpgwo-animations0.png',
      'rpgwo-animations1.png',
      'rpgwo-arms0.png',
      'rpgwo-chest0.png',
      'rpgwo-floors0.png',
      'rpgwo-floors1.png',
      'rpgwo-floors2.png',
      'rpgwo-floors3.png',
      'rpgwo-floors4.png',
      'rpgwo-floors5.png',
      'rpgwo-head0.png',
      'rpgwo-head1.png',
      'rpgwo-item0.png',
      'rpgwo-item1.png',
      'rpgwo-item10.png',
      'rpgwo-item11.png',
      'rpgwo-item12.png',
      'rpgwo-item13.png',
      'rpgwo-item14.png',
      'rpgwo-item15.png',
      'rpgwo-item16.png',
      'rpgwo-item17.png',
      'rpgwo-item18.png',
      'rpgwo-item19.png',
      'rpgwo-item2.png',
      'rpgwo-item20.png',
      'rpgwo-item21.png',
      'rpgwo-item22.png',
      'rpgwo-item23.png',
      'rpgwo-item24.png',
      'rpgwo-item25.png',
      'rpgwo-item26.png',
      'rpgwo-item3.png',
      'rpgwo-item4.png',
      'rpgwo-item5.png',
      'rpgwo-item6.png',
      'rpgwo-item7.png',
      'rpgwo-item8.png',
      'rpgwo-item9.png',
      'rpgwo-legs0.png',
      'rpgwo-player0.png',
      'rpgwo-player1.png',
      'rpgwo-player2.png',
      'rpgwo-player3.png',
      'rpgwo-player4.png',
      'rpgwo-player5.png',
      'rpgwo-player6.png',
      'rpgwo-player7.png',
      'rpgwo-shield0.png',
      'rpgwo-templates0.png',
      'rpgwo-weapon0.png',
      'rpgwo-weapon1.png',
      'tileset_1bit.png',
      'weapons.png',
      'armor.png',
      'bonus.png',
      'emoticons.png',
      'fishing.png',
      'general.png',
      'insects.png',
      'misc.png',
      'potions.png',
    ],
    tileSize: 32,
    waterFloor: 1,
    mineItemType: 3183,
    characterCreation: {
      attributes: [
        {name: 'life'},
        {name: 'stamina', derived: {from: 'life', creationMultiplier: 2}},
        {name: 'mana', derived: {from: 'wisdom'}},
        {name: 'dexterity'},
        {name: 'intelligence'},
        {name: 'quickness'},
        {name: 'strength'},
        {name: 'wisdom'},
      ],
      attributePoints: 330,
      skillPoints: 66,
      requiredSkills: [
        23, // Swim
        24, // Scan
        25, // Run
        27, // Assess
        42, // Sports
        44, // Climb
      ],
      presets: [
        {
          name: 'Swordsman',
          skills: [],
          specializedSkills: [1, 4],
          attributes: {
            life: 50,
            strength: 80,
            dexterity: 100,
            quickness: 80,
            intelligence: 10,
            wisdom: 10,
          },
        },
        {
          name: 'Archer',
          skills: [37],
          specializedSkills: [1, 12],
          attributes: {
            life: 40,
            strength: 50,
            dexterity: 100,
            quickness: 30,
            intelligence: 100,
            wisdom: 10,
          },
        },
        {
          name: 'Wizard',
          skills: [17],
          specializedSkills: [16, 20],
          attributes: {
            life: 50,
            strength: 60,
            dexterity: 10,
            quickness: 10,
            intelligence: 100,
            wisdom: 100,
          },
        },
        {
          name: 'Dagger',
          skills: [],
          specializedSkills: [1, 3],
          attributes: {
            life: 60,
            strength: 50,
            dexterity: 100,
            quickness: 100,
            intelligence: 10,
            wisdom: 10,
          },
        },
        {
          name: 'Berserker',
          skills: [],
          specializedSkills: [1, 10],
          attributes: {
            life: 10,
            strength: 100,
            dexterity: 100,
            quickness: 100,
            intelligence: 10,
            wisdom: 10,
          },
        },
        {
          name: 'Blacksmith',
          skills: [],
          specializedSkills: [31, 33, 36],
          attributes: {
            life: 60,
            strength: 100,
            dexterity: 100,
            quickness: 50,
            intelligence: 10,
            wisdom: 10,
          },
        },
        {
          name: 'Carpentry',
          skills: [],
          specializedSkills: [32, 40],
          attributes: {
            life: 60,
            strength: 100,
            dexterity: 100,
            quickness: 50,
            intelligence: 10,
            wisdom: 10,
          },
        },
        {
          name: 'Cook',
          skills: [34],
          specializedSkills: [32, 35],
          attributes: {
            life: 50,
            strength: 60,
            dexterity: 10,
            quickness: 10,
            intelligence: 100,
            wisdom: 100,
          },
        },
        {
          name: 'Alchemist',
          skills: [],
          specializedSkills: [21, 32],
          attributes: {
            life: 50,
            strength: 60,
            dexterity: 10,
            quickness: 10,
            intelligence: 100,
            wisdom: 100,
          },
        },
        {
          name: 'Thief',
          skills: [29],
          specializedSkills: [3, 28],
          attributes: {
            life: 60,
            strength: 10,
            dexterity: 100,
            quickness: 75,
            intelligence: 75,
            wisdom: 10,
          },
        },
      ],
    },
  },
  bit16: {
    baseDir: 'worlds/16bit-world',
    spritesheets: [
      'world_001.png',
      'world_002.png',
      'items_001.png',
      'creatures_001.png',
    ],
    tileSize: 24,
    // TODO
    waterFloor: 1,
    // TODO
    mineItemType: 1,
    characterCreation: {
      simple: true,
      attributes: [
        {name: 'life'},
        {name: 'stamina'},
        {name: 'mana'},
        {name: 'dexterity'},
        {name: 'intelligence'},
        {name: 'quickness'},
        {name: 'strength'},
        {name: 'wisdom'},
      ],
      attributePoints: 1000,
      skillPoints: 100,
    },
  },
  bit: {
    baseDir: 'worlds/bit-world',
    spritesheets: [
      'tileset_1bit_001.png',
      'tileset_1bit_002.png',
    ],
    tileSize: 16,
    waterFloor: 2,
    mineItemType: 8,
    characterCreation: {
      simple: true,
      attributes: [
        {name: 'life'},
        {name: 'stamina'},
        {name: 'mana'},
        {name: 'dexterity'},
        {name: 'intelligence'},
        {name: 'quickness'},
        {name: 'strength'},
        {name: 'wisdom'},
      ],
      attributePoints: 1000,
      skillPoints: 100,
    },
  },
  // TODO
  // urizen: {
  //   baseDir: 'worlds/urizen-world',
  //   tileSize: 12,
  //   characterCreation: {
  //     simple: true,
  //     attributePoints: 1000,
  //     skillPoints: 100,
  //   },
  // },
};

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
    if (process.env.GRIDIA_EXECUTION_ENV === 'node') {
      const fs = await import('fs');
      const url = await import('url');
      const path = await import('path');
      const dir = path.dirname(url.fileURLToPath(import.meta.url));
      return JSON.parse(fs.readFileSync(dir + '/../' + pathRelativeToRoot, 'utf-8'));
    } else if (process.env.GRIDIA_EXECUTION_ENV === 'browser') {
      return fetch(pathRelativeToRoot).then((r) => r.json());
    } else {
      throw new Error('GRIDIA_EXECUTION_ENV not set');
    }
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
  } else if (worldDataDef_.baseDir === 'worlds/16bit-world') {
    [floors, items, itemUses, monsters, skills] = await Promise.all([
      loadDataFile('worlds/16bit-world/content/floors.json'),
      loadDataFile('worlds/16bit-world/content/items.json'),
      loadDataFile('worlds/16bit-world/content/itemuses.json'),
      loadDataFile('worlds/16bit-world/content/monsters.json'),
      loadDataFile('worlds/rpgwo-world/content/skills.json'),
    ]);
  } else if (worldDataDef_.baseDir === 'worlds/bit-world') {
    [floors, items, itemUses, monsters, skills] = await Promise.all([
      loadDataFile('worlds/bit-world/content/floors.json'),
      loadDataFile('worlds/bit-world/content/items.json'),
      loadDataFile('worlds/bit-world/content/itemuses.json'),
      loadDataFile('worlds/bit-world/content/monsters.json'),
      loadDataFile('worlds/rpgwo-world/content/skills.json'),
    ]);
  } else if (worldDataDef_.baseDir === 'worlds/urizen-world') {
    function addItem(item: Partial<MetaItem>, x?: number, y?: number) {
      const graphics = x !== undefined && y !== undefined ?
        {file: 'tileset.png', frames: [x + y * 50]} :
        {file: 'tileset.png', frames: [20]};
      items.push({
        id: items.length,
        name: 'Unnamed item',
        class: 'Normal',
        graphics,
        burden: 0,
        stackable: false,
        moveable: true,
        rarity: 0,
        ...item,
      });
    }

    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        addItem({}, x, y);
      }
    }

    floors = [
      {id: 0, graphics: {file: 'tileset.png', frames: [15]}, color: '0'},
    ];
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
    return (item as MetaItem | null) || {
      id: i,
      name: 'Unknown',
      class: 'Normal',
      graphics: {
        file: '',
        frames: [],
      },
      burden: 0,
      rarity: 0,
      blocksMovement: true,
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
    // @ts-expect-error
    use.toolName = getName(use.tool);
    // @ts-expect-error
    use.focusName = getName(use.focus);
    // @ts-expect-error
    use.productNames = use.products.map((product) => getName(product.type));
  }
}

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

export function getWorldDataDefinition() {
  return worldDataDef;
}

export function getTileSize() {
  return worldDataDef.tileSize;
}

export function getAttribute(name: string) {
  return worldDataDef.characterCreation.attributes.find((attr) => attr.name === name);
}

export function getAttributes() {
  return worldDataDef.characterCreation.attributes.map((attr) => attr.name);
}

export function isAttribute(name: string) {
  return worldDataDef.characterCreation.attributes.some((attr) => attr.name === name);
}

export function getWaterFloor() {
  return worldDataDef.waterFloor;
}

export function getMineItemType() {
  return worldDataDef.mineItemType;
}

export function getFloors() {
  return data.floors;
}

export function getMetaFloor(id: number): MetaFloor {
  return data.floors[id] || {...data.floors[0]};
}

export function getMetaItems(): MetaItem[] {
  return data.items;
}

export function getMetaItem(id: number): MetaItem {
  return data.items[id] || {
    ...data.items[0],
    id,
    name: 'Undefined item',
  };
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

export function getItemUsesForSkill(skillId: number, level?: number) {
  return data.itemUses.filter((usage) => {
    if (usage.skillId !== skillId) return false;
    if (level !== undefined && usage.minimumSkillLevel !== undefined && level < usage.minimumSkillLevel) {
      return false;
    }
    return true;
  });
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

export function getMonsterTemplates() {
  return data.monsters;
}

export function getRandomMonsterTemplate() {
  const id = Utils.randInt(0, data.monsters.length - 1);
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

export function getSkillsGroupedByCategory() {
  const skillsByCategory = new Map<string, Skill[]>();
  for (const skill of getSkills()) {
    const skills = skillsByCategory.get(skill.category) || [];
    skills.push(skill);
    skillsByCategory.set(skill.category, skills);
  }

  const skillsByCategoryOrdered = Utils.sortByPrecedence([...skillsByCategory.entries()], [
    {type: 'predicate', fn: (kv) => kv[0] === 'combat basics'},
    {type: 'predicate', fn: (kv) => kv[0] === 'combat'},
    {type: 'predicate', fn: (kv) => kv[0] === 'magic'},
    {type: 'predicate', fn: (kv) => kv[0] === 'crafts'},
  ]);

  return new Map(skillsByCategoryOrdered);
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

  for (const key of getAttributes()) {
    // @ts-expect-error
    const multiplier = skill[key] || 0;
    if (!multiplier) continue;

    const abrv = key.substring(0, 3).toUpperCase();
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
