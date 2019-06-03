// WIP. Current Gridia content files are the result of a long-lost Java converter.

import * as fs from 'fs';
import * as path from 'path';

// Just for self-referential lookups - Can't use '../content.ts' b/c it loads data from disk,
// not what was just parsed.
const state = {
  items: [],
};

function getMetaItemByName(name: string) {
  const lowerCaseName = name.toLowerCase();
  return state.items.find((item) => Boolean(item && item.name.toLowerCase() === lowerCaseName));
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

function printUniqueKeys(objects) {
  const keys = new Set();
  for (const object of objects) {
    for ( const key of Object.keys(object)) {
      keys.add(key);
    }
  }
  console.log([...keys].sort());
}

function camelCase(str: string) {
  return str[0].toLowerCase() + str.substring(1);
}

function filterProperties(object: any, whitelist: string[]) {
  for (const key of Object.keys(object)) {
    if (!whitelist.includes(key)) {
      delete object[key];
    }
  }
}

function sortObject(object, explicitOrder) {
  const sorted = {};

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
  const defaults = {
    burden: 10000,
    moveable: true,
    rarity: 1,
    stackable: false,
    walkable: true,
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

  // Just in case items are defined out of order.
  items.sort((a, b) => a.id - b.id);

  // printUniqueKeys(items);

  // Only save properties that Gridia utilizes.
  const whitelist = [
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
  ];
  for (const item of items) {
    filterProperties(item, whitelist);
  }

  return items;
}

function parseItemUsagesIni() {
  const usagesIni = loadIni('itemuse');

  const defaults = {
    // burden: 10000,
    // moveable: true,
    // stackable: false,
    // walkable: true,
  };
  const usages = [];

  let currentUsage;
  for (const [key, value] of usagesIni) {
    if (key.match(/^itemuse$/i)) {
      currentUsage = {
        ...defaults,
        products: [],
      };
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
      currentUsage.products[index].quantity = forcenum(value);
    } else if (key.match(/^successitem/i)) {
      const index = forcenum(key.replace(/successitem/i, '')) - 1;
      currentUsage.products[index] = {
        type: parseItemId(value),
        quantity: 1,
      };
    } else if (key.match(/^successfocus$/i)) {
      currentUsage.successFocus = {
        type: parseItemId(value),
        quantity: 1,
      };
    } else if (key.match(/^successmsg$/i)) {
      currentUsage.successMessage = value;
    } else if (key.match(/^skillxpsuccess$/i)) {
      currentUsage.skillSuccessXp = forcenum(value);
    } else if (key.match(/^animation$/i)) {
      // TODO remove when animations are converted.
      const animations = require('../../world/content/animations');
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

      currentUsage[camelCaseKey] = convertedValue;
    }
  }

  for (const usage of usages) {
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
  const whitelist = [
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
    filterProperties(usage, whitelist);
  }

  if (process.env.DEBUG === '1') {
    for (const usage of usages) {
      if (usage.tool >= 0) usage.tool_ = state.items[usage.tool].name;
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

      currentSkill[camelCaseKey] = convertedValue;
    }
  }

  // printUniqueKeys(skills);

  // Only save properties that Gridia utilizes.
  const whitelist = [
    'id',
    'name',
  ];
  for (const skill of skills) {
    filterProperties(skill, whitelist);
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
  const items = [
    {
      id: 0,
      name: 'Nothing',
      class: 'Normal',
      burden: 0,
      walkable: true,
      moveable: true,
      stackable: false,
    },
    ...parseItemsIni(),
  ];

  const explicitOrder = ['id', 'name', 'class'];
  return fillGaps(items, (id: number) => ({
    id,
    name: 'Unknown',
    burden: 0,
    walkable: true,
    moveable: true,
    stackable: false,
  })).map((item) => sortObject(item, explicitOrder));
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
}
run();
