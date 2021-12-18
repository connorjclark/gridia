/* eslint-disable */

import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import { EQUIP_SLOTS } from '../container.js';

// lol esmodules.
const __dirname = path.join(path.dirname(decodeURI(new URL(import.meta.url).pathname))).replace(/^\\([A-Z]:\\)/, '$1');

const assetFolder = `${__dirname}/../../assets/rpgwo-v1.15`;

function loadContent(name: string) {
  return JSON.parse(fs.readFileSync(`${__dirname}/../../worlds/rpgwo-world/content/${name}`, 'utf-8'));
}

// Just for self-referential lookups - Can't use '../content.ts' b/c it loads data from disk,
// not what was just parsed.
const state = {
  items: [] as MetaItem[],
  floors: [] as MetaFloor[],
  usages: [] as ItemUse[],
  skills: [] as Skill[],
  spells: [] as Spell[],
  lootTables: {} as Record<string, LootTable>,
  monsters: [] as Monster[],
};

function getMetaItemByName(name: string) {
  const lowerCaseName = name.toLowerCase();
  const meta = state.items.find((item) => Boolean(item && item.name.toLowerCase() === lowerCaseName));
  if (!meta) throw new Error('no ' + name);
  return meta;
}

function getSkillByName(name: string) {
  return state.skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

function loadIni(type: string) {
  const iniPath = `${assetFolder}/data-files/${type}.ini`;
  return fs.readFileSync(iniPath, 'utf-8')
    .split(/[\n\r]+/)
    .filter((line) => !line.startsWith(';'))
    .map((line) => {
      const kv = line.split('=');
      if (kv.length === 2) {
        // Remove stuff after ":::" in values.
        kv[1] = kv[1].split(':::')[0];
        kv[1] = kv[1].trim();
      }
      return kv;
    })
    .filter((kv) => kv[0]);
}

function forcenum(val: string) {
  return parseFloat(val);
}

function loosenum(val: string) {
  // This is ok, b/c strings like "Infinity" or "1/8 Full Water Barrel"
  // should not be converted to a number.
  if (!val || !val.match(/^[+-]?([0-9]*[.])?[0-9]+$/)) {
    return val;
  }
  return parseFloat(val);
}

function printUniqueKeys(objects: any[]) {
  const keys = new Set();
  for (const object of objects) {
    for (const key of Object.keys(object)) {
      keys.add(key);
    }
  }
  console.log([...keys].sort());
}

function camelCase(str: string) {
  return str[0].toLowerCase() + str.substring(1);
}

function uppercaseFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.substr(1);
}

function filterProperties(object: any, allowlist: string[]) {
  for (const key of Object.keys(object)) {
    if (!allowlist.includes(key)) {
      delete object[key];
    }
  }
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

function parseItemId(val: string) {
  // TODO: maybe use string enums for 'anything' / 'player' / 'hand'?
  if (val.match(/^hand$/i)) {
    return 0;
  } else if (val === '*') {
    return -1;
  } else if (val === '<player>') {
    return -2;
  } else if (val === '<mining>') {
    return -3;
  } else if (val === '<fish>') {
    return -4;
  } else if (loosenum(val) !== val) {
    return forcenum(val);
  } else {
    return getMetaItemByName(val).id;
  }
}

function parseItemsIni() {
  const itemsIni = loadIni('item');

  // TODO: consider putting defaults on the first item,
  // and making every MetaItem.prototype = that first item.
  // would make items.json much smaller.
  const defaults: Partial<MetaItem> = {
    burden: 10000,
    moveable: true,
    rarity: 1,
    stackable: false,
    light: 0,
  };
  const items = [];

  let currentItem: any = undefined;
  for (const [key, value] of itemsIni) {
    if (key.match(/^item$/i)) {
      currentItem = {
        id: forcenum(value),
        ...defaults,
      };
      items.push(currentItem);
    } else if (!currentItem) {
      // defaults come first.
      // @ts-expect-error
      defaults[camelCase(key.replace('default', ''))] = value;
    } else if (key.match(/^animation/i)) {
      const num = forcenum(value);
      if (!currentItem.graphics) {
        currentItem.graphics = {
          file: `rpgwo-item${Math.floor(num / 100)}.png`,
          frames: [],
        };
      }
      currentItem.graphics.frames.push(num % 100);
    } else if (key.match(/^notmovable/i)) {
      currentItem.moveable = false;
    } else if (key.match(/^imagetype/i)) {
      currentItem.height = forcenum(value) + 1;
    } else if (key.match(/^BlockMovement/i)) {
      if (value === '1') currentItem.blocksMovement = true;
    } else if (key.match(/^OpenSightLine/i)) {
      currentItem.blocksLight = false;
    } else if (key.match(/^WearImage/i)) {
      currentItem.equipImage = forcenum(value);
    } else if (key.match(/^WeaponMinRange/i)) {
      currentItem.minRange = forcenum(value);
    } else if (key.match(/^WeaponMaxRange/i)) {
      currentItem.maxRange = forcenum(value);
    } else if (key.match(/^ArmorSpot/i)) {
      currentItem.equipSlot = uppercaseFirstLetter(value);
    } else if (key.match(/^Ammo/i)) {
      currentItem.ammoType = forcenum(value);
    } else if (key.match(/^CombatSkill/i)) {
      currentItem.combatSkill = getSkillByName(value)?.id;
    } else if (key.match(/^Readable/i)) {
      currentItem.readable = true;
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: string | number | boolean = value;
      const maybeNumber = loosenum(value);
      if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
        convertedValue = maybeNumber;
      }
      if (convertedValue === undefined) {
        convertedValue = true;
      }

      currentItem[camelCaseKey] = convertedValue;
    }
  }

  for (const item of items) {
    if (!item.graphics) item.graphics = { file: 'rpgwo-item0.png', frames: [1] };
    if (item.height) item.graphics.height = item.height;
  }

  // Only un-walkable items block light, unless 'OpenSightLine' was used.
  for (const item of items) {
    if (item.blocksMovement && !('blocksLight' in item)) {
      item.blocksLight = true;
    } else {
      item.blocksLight = false;
    }
  }

  for (const item of items) {
    if (item.class === 'PLANT') item.class = 'Plant';
    if (item.class) item.class = uppercaseFirstLetter(item.class);

    item.growthItem = item.growthItem || item.degradeItem;
    item.growthDelta = item.growthDelta || item.degradeDelta;
  }

  for (const item of items) {
    if (item.class === 'Weapon') item.equipSlot = 'Weapon';
    if (item.class === 'Wand') item.equipSlot = 'Weapon';
    if (item.class === 'Ammo') item.equipSlot = 'Weapon';
    if (item.class === 'Shield') item.equipSlot = 'Shield';
    if (item.class === 'Ammo') item.equipSlot = 'Ammo';
  }

  for (const item of items) {
    if (!item.equipImage) continue;

    item.equipImage = {
      file: `rpgwo-${item.equipSlot.toLowerCase()}${Math.floor(item.equipImage / 100)}.png`,
      frames: [item.equipImage % 100],
    };
  }

  // Just in case items are defined out of order.
  items.sort((a, b) => a.id - b.id);

  // printUniqueKeys(items);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'graphics',
    'burden',
    'class',
    'growthDelta',
    'growthItem',
    'id',
    'moveable',
    'name',
    'rarity',
    'stackable',
    'blocksMovement',
    'trapEffect',
    'light',
    'blocksLight',
    'equipSlot',
    'equipImage',
    'armorLevel',
    'attackSpeed',
    'damageLow',
    'damageHigh',
    'combatSkill',
    'ammoType',
    'minRange',
    'maxRange',
    'readable',
  ];
  for (const item of items) {
    filterProperties(item, allowlist);
  }

  return items;
}

function parseItemUsagesIni(): ItemUse[] {
  const usagesIni = loadIni('itemuse');

  const defaults: Partial<ItemUse> = {
    // burden: 10000,
    // moveable: true,
    // stackable: false,
  };
  const usages: ItemUse[] = [];

  let currentUsage: Partial<ItemUse> = {};
  for (const [key, value] of usagesIni) {
    if (key.match(/^itemuse$/i)) {
      currentUsage = {
        ...defaults,
        products: [],
      };
      // @ts-expect-error
      usages.push(currentUsage);
    } else if (key.match(/^itemtool$/i)) {
      currentUsage.tool = parseItemId(value);
    } else if (key.match(/^itemfocus$/i)) {
      currentUsage.focus = parseItemId(value);
    } else if (key.match(/^successtool$/i)) {
      const successToolId = parseItemId(value);
      if (successToolId > 0) {
        currentUsage.successTool = successToolId;
      }
      currentUsage.toolQuantityConsumed = 1;
    } else if (key.match(/^successitemqty/i)) {
      const index = forcenum(key.replace(/successitemqty/i, '')) - 1;
      // @ts-expect-error
      currentUsage.products[index].quantity = forcenum(value);
    } else if (key.match(/^successitem/i)) {
      // Currently don't handle things like <fish>.
      if (!value.startsWith('<')) {
        const index = forcenum(key.replace(/successitem/i, '')) - 1;
        // @ts-expect-error
        currentUsage.products[index] = {
          type: parseItemId(value),
          quantity: 1,
        };
      }
    } else if (key.match(/^successfocus$/i)) {
      // @ts-expect-error
      currentUsage.successFocus = {
        type: parseItemId(value),
        quantity: 1,
      };
      currentUsage.focusQuantityConsumed = 1;
    } else if (key.match(/^surfaceground$/i)) {
      const num = {
        1: 44,
        16: 3,
        126: 44,
        133: 39,
      }[forcenum(value)];
      if (num) currentUsage.successFloor = num;
    } else if (key.match(/^successmsg$/i)) {
      currentUsage.successMessage = value;
    } else if (key.match(/^skill$/i)) {
      let skillName = value.toLowerCase();
      if (skillName === 'leather') skillName = 'tailor';

      // @ts-expect-error
      currentUsage.skillId = state.skills.find((skill) => skill.name.toLowerCase() === skillName).id;
    } else if (key.match(/^skillmin$/i)) {
      currentUsage.minimumSkillLevel = forcenum(value);
    } else if (key.match(/^skillmax$/i)) {
      currentUsage.maximumSkillLevel = forcenum(value);
    } else if (key.match(/^skillxpsuccess$/i)) {
      currentUsage.skillSuccessXp = forcenum(value);
    } else if (key.match(/^animation$/i)) {
      // TODO remove when animations are converted.
      const animations = loadContent('animations.json');
      currentUsage.animation = animations[forcenum(value) - 1].name;
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: string | number | boolean = value;
      const maybeNumber = loosenum(value);
      if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
        convertedValue = maybeNumber;
      }
      if (convertedValue === undefined) {
        convertedValue = true;
      }

      // @ts-expect-error
      currentUsage[camelCaseKey] = convertedValue;
    }
  }

  for (const usage of usages) {
    // @ts-expect-error
    if (usage.successFocus) usage.products.unshift(usage.successFocus);
    usage.products = usage.products.filter(Boolean);

    // TODO: support rich item selectors. focusSubType, <mining>, etc.
    usage.focus = Math.max(usage.focus || 0, 0);
    for (const product of usage.products) {
      product.type = Math.max(product.type, 0);
    }
  }

  // printUniqueKeys(usages);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'animation',
    'focus',
    'focusQuantityConsumed',
    'products',
    'skillId',
    'minimumSkillLevel',
    'maximumSkillLevel',
    'skillSuccessXp',
    'successFloor',
    'successMessage',
    'successTool',
    'tool',
    'toolQuantityConsumed',
  ];
  for (const usage of usages) {
    filterProperties(usage, allowlist);
  }

  if (process.env.DEBUG === '1') {
    for (const usage of usages) {
      // @ts-expect-error
      if (usage.tool >= 0) usage.tool_ = state.items[usage.tool].name;
      // @ts-expect-error
      if (usage.focus >= 0) usage.focus_ = state.items[usage.focus].name;
    }
  }

  return usages;
}

function parseSkillsIni() {
  const skillsIni = loadIni('Skill');

  const skills: Skill[] = [];

  let currentSkill;
  for (const [key, value] of skillsIni) {
    if (key.match(/^skill$/i)) {
      currentSkill = {
        id: forcenum(value),
      };
      // @ts-expect-error
      skills.push(currentSkill);
    } else if (key.match(/quick|dex|str|intel|wisdom/i)) {
      const newKey = {
        quick: 'quickness',
        dex: 'dexterity',
        str: 'strength',
        intel: 'intelligence',
        wisdom: 'wisdom',
      }[key.toLowerCase()];
      if (!newKey) throw new Error('unexpected key: ' + key);
      // @ts-expect-error
      currentSkill[newKey] = forcenum(value);
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: string | number | boolean = value;
      const maybeNumber = loosenum(value);
      if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
        convertedValue = maybeNumber;
      }
      if (convertedValue === undefined) {
        convertedValue = true;
      }

      // @ts-expect-error
      currentSkill[camelCaseKey] = convertedValue;
    }
  }

  for (const skill of skills) {
    if (skill.purpose) skill.purpose = skill.purpose.toLowerCase();
  }

  // printUniqueKeys(skills);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'id',
    'name',
    'skillPoints',
    'description',
    'purpose',
    'divisor',
    'quickness',
    'dexterity',
    'strength',
    'intelligence',
    'wisdom',
  ];
  for (const skill of skills) {
    filterProperties(skill, allowlist);
  }

  return skills;
}

function parseMagicIni() {
  const magicIni = loadIni('magic');

  const spells: Spell[] = [];

  let currentSpell: Spell | undefined;
  for (const [key, value] of magicIni) {
    if (key.match(/^spell$/i)) {
      // @ts-expect-error
      currentSpell = {
        id: forcenum(value),
        spawnItems: [],
      };
      // @ts-expect-error
      spells.push(currentSpell);
    } else if (!currentSpell) {
      // defaults come first.
    } else if (key.match(/^ManaCost$/i)) {
      currentSpell.mana = forcenum(value);
    } else if (key.match(/^SpawnItem$/i)) {
      currentSpell.spawnItems?.push({
        type: getMetaItemByName(value).id,
        quantity: 1,
      });
    } else if (key.match(/^SpawnItemQty$/i)) {
      const item = currentSpell.spawnItems?.[currentSpell.spawnItems?.length - 1];
      if (item) item.quantity = forcenum(value);
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: string | number | boolean = value;
      const maybeNumber = loosenum(value);
      if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
        convertedValue = maybeNumber;
      }
      if (convertedValue === undefined) {
        convertedValue = true;
      }

      // @ts-expect-error
      currentSpell[camelCaseKey] = convertedValue;
    }
  }

  for (let spell of spells as any) {
    spell.failureXp = forcenum(spell.failedXp);

    spell.target = spell.target.toLowerCase();
    if (spell.target === 'item') spell.target = 'world';
    if (spell.target === 'spot') spell.target = 'world';

    spell.animation = spell.animation0;

    spell.range = spell.range || 5;

    // @ts-expect-error
    spell.skill = state.skills.find(s => s && s.name === spell.skill).id;

    if (!spell.spawnItems.length) {
      delete spell.spawnItems;
    }

    if (spell.transformFrom) {
      spell.transformItemFrom = {
        type: getMetaItemByName(spell.transformFrom).id,
        quantity: 1,
      };
    }
    if (spell.transformTo) {
      spell.transformItemTo = {
        type: getMetaItemByName(spell.transformTo).id,
        quantity: 1,
      };
    }
  }

  // printUniqueKeys(spells);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'id',
    'name',
    'description',
    'mana',
    'skill',
    'target',
    'range',
    'successXp',
    'failureXp',
    'variance',
    'life',
    'stamina',
    'animation',
    'projectileAnimation',
    'castTime',
    'quickness',
    'dexterity',
    'strength',
    'intelligence',
    'wisdom',
    'hero',
    'spawnItems',
    'transformItemFrom',
    'transformItemTo',
  ];
  for (const spell of spells) {
    filterProperties(spell, allowlist);
  }

  return spells;
}

function parseLootTablesIni() {
  const treasureIni = loadIni('treasure');

  let treasureLists: Array<{
    id: string,
    items: Array<{ name: string, chance: number }>,
  }> = [];
  let currentTreasureList;
  let currentItem: { item: string, chance: number } | undefined;
  for (const [key, value] of treasureIni) {
    if (key.match(/^treasure$/i)) {
      currentTreasureList = {
        id: fixTreasureName(value),
        items: [],
      };
      treasureLists.push(currentTreasureList);
    } else if (key.match(/^item$/i)) {
      // @ts-expect-error
      currentItem = { name: value };
      // @ts-expect-error
      currentTreasureList?.items.push(currentItem);
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: string | number | boolean = value;
      const maybeNumber = loosenum(value);
      if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
        convertedValue = maybeNumber;
      }
      if (convertedValue === undefined) {
        convertedValue = true;
      }

      // @ts-expect-error
      currentItem[camelCaseKey] = convertedValue;
    }
  }

  const lootTables: Record<string, LootTable> = {};
  for (const { id, items } of Object.values(treasureLists)) {
    lootTables[id] = [{
      type: 'one-of',
      values: items.map(i => {
        const entry: DropTableEntry = { type: getMetaItemByName(i.name).id };
        if (i.chance !== 1) entry.chance = i.chance;
        return entry;
      }),
    }];
  }

  return lootTables;
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

function convertItems() {
  let items: MetaItem[] = [
    {
      id: 0,
      name: 'Nothing',
      graphics: {
        file: "rpgwo-item0.png",
        frames: [1],
      },
      class: 'Normal',
      burden: 0,
      light: 0,
      moveable: true,
      stackable: false,
      blocksLight: false,
    },
    ...parseItemsIni(),
  ];

  // @ts-expect-error
  items.push({
    id: items[items.length - 1].id + 1,
    name: 'Mine',
    graphics: {
      file: 'rpgwo-templates0.png',
      frames: [50],
      templateType: 'bit-offset',
    },
    class: 'Normal',
    blocksMovement: true,
    moveable: false,
    blocksLight: true,
  });

  // gfx are bad, so just remove from mining class for now.
  for (const item of items.filter(item => item.name === 'Sulfur Ore' || item.name === 'Phosphorous Ore')) {
    item.class = 'Normal';
  }

  const replaceGraphics = [
    { name: 'Small Branches', file: 'general.png', frames: [20] },
    { name: 'Small Log', file: 'general.png', frames: [21] },
  ];
  for (const { name, ...graphics } of replaceGraphics) {
    const item = items.find(i => i.name === name);
    if (!item) throw new Error('missing item ' + name);
    item.graphics = graphics;
  }

  const dirt = items.find(item => item.name === 'Pile of Dirt');
  if (dirt) dirt.class = 'Normal';

  const explicitOrder = ['id', 'name', 'class'];
  return items.map((item) => sortObject(item, explicitOrder));
}

function convertItemUsages() {
  const usages = parseItemUsagesIni();

  // Add some animations.
  for (const usage of usages) {
    if (usage.animation) continue;

    if (/chop up|cut down/.test(usage.successMessage)) {
      usage.animation = 'Woodcutting';
    }
  }

  for (const closedDoor of state.items.filter(item => item.name.includes('Closed Door'))) {
    const usage = usages.find(u => u.tool === 0 && u.focus === closedDoor.id);
    if (usage) continue;

    const openDoor = state.items.find(i => i.id > closedDoor.id && i.name === closedDoor.name.replace('Closed', 'Open'));
    if (!openDoor) continue;

    usages.push({
      tool: 0,
      focus: openDoor.id,
      products: [{ type: closedDoor.id, quantity: 1 }],
      successMessage: 'You open the door.',
      focusQuantityConsumed: 1,
      toolQuantityConsumed: 1,
    });
    usages.push({
      tool: 0,
      focus: closedDoor.id,
      products: [{ type: openDoor.id, quantity: 1 }],
      successMessage: 'You open the door.',
      focusQuantityConsumed: 1,
      toolQuantityConsumed: 1,
    });
  }

  usages.sort((a, b) => {
    if (a.tool > b.tool) return 1;
    if (a.tool < b.tool) return -1;

    if (a.focus > b.focus) return 1;
    if (a.focus < b.focus) return -1;

    return 0;
  });

  const explicitOrder = ['tool', 'focus', 'skill', 'minimumSkillLevel', 'maximumSkillLevel'];
  return usages.map((usage) => sortObject(usage, explicitOrder));
}

function convertSkills() {
  const skills = [
    ...parseSkillsIni(),
  ];

  const categories: Record<string, string> = {
    "Melee Defense": 'combat basics',
    "Unarmed Attack": 'combat',
    "Dagger": 'combat',
    "Sword": 'combat',
    "Axe": 'combat',
    "Mace": 'combat',
    "Spear": 'combat',
    "Staff": 'combat',
    "Flail": 'combat',
    "Scythe": 'combat',
    "Missle Defense": 'combat basics',
    "Bow": 'combat',
    "Crossbow": 'combat',
    "Throwing": 'combat',
    "Magic Defense": 'combat basics',
    "Black Magic": 'magic',
    "White Magic": 'magic',
    "Red Magic": 'magic',
    "Blue Magic": 'magic',
    "Mana Conversion": 'magic',
    "Alchemy": 'crafts',
    "Read Ancient": '',
    "Swim": '',
    "Scan": '',
    "Run": '',
    "Deception": '',
    "Assess": '',
    "Stealth": '',
    "Trap": '',
    "Tame": '',
    "Blacksmith": 'crafts',
    "Farming": 'crafts',
    "Masonry": 'crafts',
    "Fishing": 'crafts',
    "Cooking": 'crafts',
    "Mining": 'crafts',
    "Fletching": 'crafts',
    "LockSmith": '',
    "Tailor": 'crafts',
    "Carpentry": 'crafts',
    "First Aid": '',
    "Sports": '',
    "Jewelry Making": 'crafts',
    "Climb": '',
  };
  for (const skill of skills) {
    skill.category = categories[skill.name] || 'miscellaneous';
  }

  const explicitOrder = ['id', 'name', 'description', 'skillPoints', 'divisor'];
  return skills.map((usage) => sortObject(usage, explicitOrder));
}

function calculateFloorColor(id: number) {
  const imageName = `${assetFolder}/gfx/floors${Math.floor(id / 100)}.png`;
  const x = (id % 10) * 32;
  const y = Math.floor((id % 100) / 10) * 32;
  const args = [
    'convert',
    imageName,
    '+set', 'date:modify',
    ...`-crop 32x32+${x}+${y} +repage`.split(' '),
    ...'-resize 1x1 txt:-'.split(' '),
  ];
  const output = childProcess.execFileSync('magick', args, { encoding: 'utf-8' });
  // # ImageMagick pixel enumeration: 1,1,255,srgb
  // 0,0: (80.0724,126.613,38.5971)  #507F27  srgb(31.4009%,49.6523%,15.1361%)
  const hex = output.split('#')[2].substr(0, 6);
  return hex;
}

function convertFloors() {
  const floors: MetaFloor[] = [];
  const oldFloors = loadContent('floors.json');

  for (let i = 0; i <= 51; i++) {
    floors.push({
      id: i,
      graphics: {
        file: 'rpgwo-floors0.png',
        frames: [i],
      },
      color: oldFloors[i]?.color || calculateFloorColor(i),
    });
  }
  for (let i = 0; i < 25; i++) {
    const graphicIndex = 100 + i * 20;
    const id = 52 + i;
    floors.push({
      id,
      graphics: {
        file: `rpgwo-floors${Math.floor(graphicIndex / 100)}.png`,
        frames: [graphicIndex % 100],
      },
      color: oldFloors[id]?.color || calculateFloorColor(i),
    });
  }

  // Water
  floors[1].color = 'ADBCE6';
  floors[1].graphics = {
    file: 'rpgwo-templates0.png',
    frames: [0],
    templateType: 'bit-offset',
  };

  return floors;
}

function fixTreasureName(value: string) {
  return value.toLowerCase()
    .replace('jewlery', 'jewelry')
    .replace('sheild', 'shield')
    .replace('weapn', 'weapon');
}

function parseMonsterIni() {
  const monsterIni = loadIni('monster');
  const armorKeys = [
    'ChestArmor',
    'HeadArmor',
    'LegArmor',
    'Shield',
    'Weapon',
  ];

  const defaults: Partial<Monster> = {};
  let monsters: Monster[] = [];

  let currentMonster: Monster | undefined = undefined;
  for (const [key, value] of monsterIni) {
    if (key.match(/^monster$/i)) {
      // @ts-expect-error
      currentMonster = {
        id: forcenum(value),
        ...defaults,
      };
      // @ts-expect-error
      monsters.push(currentMonster);
    } else if (!currentMonster) {
      // defaults come first.
      // @ts-expect-error
      defaults[camelCase(key.replace('default', ''))] = value;
    } else if (armorKeys.includes(key)) {
      currentMonster.equipment = currentMonster.equipment || [];
      let slotKey = uppercaseFirstLetter(
        key.toLocaleLowerCase()
          .replace('armour', '')
          .replace('armor', '')
      );
      if (slotKey === 'Leg') slotKey = 'Legs';
      // @ts-expect-error
      const slotIndex = EQUIP_SLOTS[slotKey];
      const meta = getMetaItemByName(value);
      currentMonster.equipment[slotIndex] = { type: meta.id, quantity: 1 };
    } else if (key.match(/^deaditem/i)) {
      currentMonster.deadItem = getMetaItemByName(value).id;
    } else if (key.match(/^treasure\d+$/i)) {
      currentMonster.lootTable = currentMonster.lootTable || [];
      if (value.startsWith('<')) {
        const id = fixTreasureName(value.substr(1, value.length - 2));
        if (!state.lootTables[id]) throw new Error('missing loot table: ' + id);

        currentMonster.lootTable.push({
          type: 'ref',
          id,
        });
      } else {
        currentMonster.lootTable.push({
          type: getMetaItemByName(value).id,
        });
      }
    } else if (key.match(/^TreasureQty/i)) {
      // @ts-expect-error
      const entry = currentMonster.lootTable[currentMonster.lootTable.length - 1];
      const quantity = forcenum(value);
      if (quantity !== 1) entry.quantity = quantity;
    } else if (key.match(/^TreasureChance/i)) {
      // @ts-expect-error
      const entry = currentMonster.lootTable[currentMonster.lootTable.length - 1];
      entry.chance = forcenum(value);
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: string | number | boolean = value;
      const maybeNumber = loosenum(value);
      if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
        convertedValue = maybeNumber;
      }
      if (convertedValue === undefined) {
        convertedValue = true;
      }

      // @ts-expect-error
      currentMonster[camelCaseKey] = convertedValue;
    }
  }

  // @ts-expect-error
  monsters = monsters.filter(m => m.image !== undefined);

  for (const monster of monsters) {
    // @ts-expect-error
    const image = monster.image;
    // @ts-expect-error
    const imageType = monster.imageType || 0;

    let width, height;
    if (imageType === 1) {
      height = 2;
    } else if (imageType === 2) {
      width = 2;
      height = 2;
    } else if (imageType === 3) {
      width = 3;
      height = 3;
    }

    monster.graphics = {
      file: `rpgwo-player${Math.floor(image / 100)}.png`,
      frames: [(image % 100) - 1],
      width,
      height,
    };

    if (monster.speed === undefined) monster.speed = 2;
  }

  // Just in case items are defined out of order.
  monsters.sort((a, b) => a.id - b.id);

  // printUniqueKeys(monsters);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'deadItem',
    'eatGrass',
    'graphics',
    'id',
    'level',
    'life',
    'magicDefense',
    'meleeDefense',
    'missleDefense',
    'name',
    'lootTable',
    'roam',
    'speed',
    'stamina',
    'weapon',
  ];
  for (const item of monsters) {
    filterProperties(item, allowlist);
  }

  return monsters;
}

function convertSpells() {
  const spells = parseMagicIni();
  const explicitOrder = ['id', 'name', 'description'];
  return spells.map((spell) => sortObject(spell, explicitOrder));
}

function convertLootTables() {
  const lootTables = parseLootTablesIni();

  // TODO: remove
  lootTables.food = [{
    type: 'one-of',
    values: [
      { type: getMetaItemByName('Red Apple').id },
      { type: getMetaItemByName('Banana').id },
    ],
  }];

  return lootTables;
}

function convertMonsters() {
  const explicitOrder = ['id', 'name'];
  const monsters = parseMonsterIni().map((monster) => sortObject(monster, explicitOrder));
  return monsters;
}

function run() {
  state.skills = convertSkills();
  const skillsPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'skills.json');

  state.items = convertItems();
  const itemsPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'items.json');

  state.usages = convertItemUsages();
  const usagesPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'itemuses.json');

  state.floors = convertFloors();
  const floorsPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'floors.json');

  state.spells = convertSpells();
  const spellsPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'spells.json');

  state.lootTables = convertLootTables();
  const lootTablesPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'lootTables.json');

  state.monsters = convertMonsters();
  const monstersPath = path.join(__dirname, '..', '..', 'worlds/rpgwo-world', 'content', 'monsters.json');

  const removeUsage = (usage: ItemUse) => {
    const index = state.usages.indexOf(usage);
    state.usages.splice(index, 1)
  };

  const removeItem = (item: MetaItem) => {
    const index = state.items.indexOf(item);
    state.items.splice(index, 1);

    for (const usage of [...state.usages]) {
      usage.products = usage.products.filter(p => p.type !== item.id);

      if (usage.focus === item.id || usage.tool === item.id) {
        removeUsage(usage);
      }
    }
  };

  for (const item of [...state.items]) {
    if (['Jail Door'].includes(item.name || '')) {
      removeItem(item);
    }
  }

  state.items = fillGaps(state.items);
  state.spells = fillGaps(state.spells);
  state.monsters = fillGaps(state.monsters);

  const blackMagic = state.skills.find(skill => skill.name === 'Black Magic');
  if (blackMagic) blackMagic.name = 'Dark Magic';

  const lightMagic = state.skills.find(skill => skill.name === 'White Magic');
  if (lightMagic) lightMagic.name = 'Light Magic';

  fs.writeFileSync(itemsPath, JSON.stringify(state.items, null, 2));
  fs.writeFileSync(floorsPath, JSON.stringify(state.floors, null, 2));
  fs.writeFileSync(usagesPath, JSON.stringify(state.usages, null, 2));
  fs.writeFileSync(skillsPath, JSON.stringify(state.skills, null, 2));
  fs.writeFileSync(spellsPath, JSON.stringify(state.spells, null, 2));
  fs.writeFileSync(lootTablesPath, JSON.stringify(state.lootTables, null, 2));
  fs.writeFileSync(monstersPath, JSON.stringify(state.monsters, null, 2));
}
run();
