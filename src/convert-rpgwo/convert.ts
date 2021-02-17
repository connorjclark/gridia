/// <reference types="../types" />

/* eslint-disable */

import * as fs from 'fs';
import * as path from 'path';
import {execFileSync} from 'child_process';

// lol esmodules.
const __dirname = path.join(path.dirname(decodeURI(new URL(import .meta.url).pathname))).replace(/^\\([A-Z]:\\)/, '$1');

function loadContent(name: string) {
  return JSON.parse(fs.readFileSync(`${__dirname}/../../world/content/${name}`, 'utf-8'));
}

// Just for self-referential lookups - Can't use '../content.ts' b/c it loads data from disk,
// not what was just parsed.
const state = {
  items: [] as MetaItem[],
};

function getMetaItemByName(name: string) {
  const lowerCaseName = name.toLowerCase();
  const meta = state.items.find((item) => Boolean(item && item.name.toLowerCase() === lowerCaseName));
  if (!meta) throw new Error('no ' + name);
  return meta;
}

function loadIni(type: string) {
  const iniPath = `${__dirname}/v1.15/data-files/${type}.ini`;
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
    walkable: true,
    light: 0,
  };
  const items = [];

  let currentItem;
  for (const [key, value] of itemsIni) {
    if (key.match(/^item$/i)) {
      currentItem = {
        id: forcenum(value),
        ...defaults,
      };
      items.push(currentItem);
    } else if (!currentItem) {
      // defaults come first.
      // @ts-ignore
      defaults[camelCase(key.replace('default', ''))] = value;
    } else if (key.match(/^animation/i)) {
      currentItem.animations = currentItem.animations || [];
      currentItem.animations.push(forcenum(value));
    } else if (key.match(/^notmovable/i)) {
      currentItem.moveable = false;
    } else if (key.match(/^imagetype/i)) {
      currentItem.imageHeight = forcenum(value) + 1;
    } else if (key.match(/^BlockMovement/i)) {
      currentItem.walkable = (value || '1') !== '1';
    } else if (key.match(/^OpenSightLine/i)) {
      currentItem.blocksLight = false;
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

      // @ts-ignore
      currentItem[camelCaseKey] = convertedValue;
    }
  }

  // Only un-walkable items block light, unless 'OpenSightLine' was used.
  for (const item of items) {
    if (!item.walkable && !('blocksLight' in item)) {
      item.blocksLight = true;
    } else {
      item.blocksLight = false;
    }
  }

  for (const item of items) {
    // @ts-ignore
    if (item.class === 'PLANT') item.class = 'Plant';
    // @ts-ignore
    if (item.class) item.class = item.class.charAt(0).toUpperCase() + item.class.substr(1);
  }

  // Just in case items are defined out of order.
  items.sort((a, b) => a.id - b.id);

  // printUniqueKeys(items);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'animations',
    'burden',
    'class',
    'growthDelta',
    'growthItem',
    'id',
    'imageHeight',
    'moveable',
    'name',
    'rarity',
    'stackable',
    'walkable',
    'trapEffect',
    'light',
    'blocksLight',
  ];
  for (const item of items) {
    filterProperties(item, allowlist);
  }

  return items;
}

function parseItemUsagesIni() {
  const usagesIni = loadIni('itemuse');

  const defaults: Partial<ItemUse> = {
    // burden: 10000,
    // moveable: true,
    // stackable: false,
    // walkable: true,
  };
  const usages: ItemUse[] = [];

  let currentUsage: Partial<ItemUse> = {};
  for (const [key, value] of usagesIni) {
    if (key.match(/^itemuse$/i)) {
      currentUsage = {
        ...defaults,
        products: [],
      };
      // @ts-ignore
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
      // @ts-ignore
      currentUsage.products[index].quantity = forcenum(value);
    } else if (key.match(/^successitem/i)) {
      const index = forcenum(key.replace(/successitem/i, '')) - 1;
      // @ts-ignore
      currentUsage.products[index] = {
        type: parseItemId(value),
        quantity: 1,
      };
    } else if (key.match(/^successfocus$/i)) {
      // @ts-ignore
      currentUsage.successFocus = {
        type: parseItemId(value),
        quantity: 1,
      };
      currentUsage.focusQuantityConsumed = 1;
    } else if (key.match(/^successmsg$/i)) {
      currentUsage.successMessage = value;
    } else if (key.match(/^skill$/i)) {
      // Normalize skill name.
      const skills = loadContent('skills.json');
      if (value === 'Leather') currentUsage.skill = 'Tailor';
      // @ts-ignore
      else currentUsage.skill = skills.find((skill) => skill.name.toLowerCase() === value.toLowerCase()).name;
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

      // @ts-ignore
      currentUsage[camelCaseKey] = convertedValue;
    }
  }

  for (const usage of usages) {
    // @ts-ignore
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
    'skill',
    'skillSuccessXp',
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
      // @ts-ignore
      if (usage.tool >= 0) usage.tool_ = state.items[usage.tool].name;
      // @ts-ignore
      if (usage.focus >= 0) usage.focus_ = state.items[usage.focus].name;
    }
  }

  return usages;
}

function parseSkillsIni() {
  const skillsIni = loadIni('Skill');

  const skills = [];

  let currentSkill;
  for (const [key, value] of skillsIni) {
    if (key.match(/^skill$/i)) {
      currentSkill = {
        id: forcenum(value),
      };
      skills.push(currentSkill);
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

      // @ts-ignore
      currentSkill[camelCaseKey] = convertedValue;
    }
  }

  // printUniqueKeys(skills);

  // Only save properties that Gridia utilizes.
  const allowlist = [
    'id',
    'name',
  ];
  for (const skill of skills) {
    filterProperties(skill, allowlist);
  }

  return skills;
}

function fillGaps(objects: any[], make: (id: number) => any) {
  const noGaps = [];

  for (const object of objects) {
    while (object.id !== noGaps.length) {
      noGaps.push(make(noGaps.length));
    }
    noGaps.push(object);
  }

  return noGaps;
}

function convertItems() {
  let items = [
    {
      id: 0,
      name: 'Nothing',
      class: 'Normal',
      burden: 0,
      walkable: true,
      light: 0,
      moveable: true,
      stackable: false,
      blocksLight: false,
    },
    ...parseItemsIni(),
  ];

  items = fillGaps(items, (id: number) => ({
    id,
    name: 'Unknown',
    burden: 0,
    walkable: true,
    light: 0,
    moveable: true,
    stackable: false,
  }));

  items.push({
    id: items.length,
    name: 'Mine',
    class: 'Normal',
    walkable: false,
    moveable: false,
    blocksLight: true,
  });

  // gfx are bad, so just remove from mining class for now.
  for (const item of items.filter(item => item.name === 'Sulfur Ore' || item.name === 'Phosphorous Ore')) {
    item.class = undefined;
  }

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

  usages.sort((a, b) => {
    if (a.tool > b.tool) return 1;
    if (a.tool < b.tool) return -1;

    if (a.focus > b.focus) return 1;
    if (a.focus < b.focus) return -1;

    return 0;
  });

  const explicitOrder = ['tool', 'focus', 'skill'];
  return usages.map((usage) => sortObject(usage, explicitOrder));
}

function convertSkills() {
  const skills = [
    {
      id: 0,
      name: 'Nothing',
    },
    ...parseSkillsIni(),
  ];
  const explicitOrder = ['id', 'name'];
  return skills.map((usage) => sortObject(usage, explicitOrder));
}

function convertFloors() {
  const floors = loadContent('floors.json');
  for (const floor of floors) {
    // Water.
    if (floor.id === 1) {
      floor.color = 'ADBCE6';
      continue;
    }

    const imageName = `world/floors/floors${Math.floor(floor.id / 100)}.png`;
    const x = (floor.id % 10) * 32;
    const y = Math.floor((floor.id % 100) / 10) * 32;
    const args = [
      'convert',
      imageName,
      ...`-crop 32x32+${x}+${y} +repage`.split(' '),
      ...'-resize 1x1 txt:-'.split(' '),
    ];
    const output = execFileSync('magick', args, {encoding: 'utf-8'});
    // # ImageMagick pixel enumeration: 1,1,255,srgb
    // 0,0: (80.0724,126.613,38.5971)  #507F27  srgb(31.4009%,49.6523%,15.1361%)
    const hex = output.split('#')[2].substr(0, 6);
    floor.color = hex;
  }

  return floors;
}

function run() {
  const items = state.items = convertItems();
  const itemsPath = path.join(__dirname, '..', '..', 'world', 'content', 'items.json');
  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
  console.log('saved ' + itemsPath);

  const usages = convertItemUsages();
  const usagesPath = path.join(__dirname, '..', '..', 'world', 'content', 'itemuses.json');
  fs.writeFileSync(usagesPath, JSON.stringify(usages, null, 2));
  console.log('saved ' + usagesPath);

  const skills = convertSkills();
  const skillsPath = path.join(__dirname, '..', '..', 'world', 'content', 'skills.json');
  fs.writeFileSync(skillsPath, JSON.stringify(skills, null, 2));
  console.log('saved ' + skillsPath);

  const floors = convertFloors();
  const floorsPath = path.join(__dirname, '..', '..', 'world', 'content', 'floors.json');
  fs.writeFileSync(floorsPath, JSON.stringify(floors, null, 2));
  console.log('saved ' + floorsPath);
}
run();
