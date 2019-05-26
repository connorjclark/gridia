// WIP. Current Gridia content files are the result of a long-lost Java converter.

import * as fs from 'fs';
import * as path from 'path';

function loadIni(type: string) {
  const iniPath = `${__dirname}/v1.15/data-files/${type}.ini`;
  return fs.readFileSync(iniPath, 'utf-8')
    .split(/[\n\r]+/)
    .filter((line) => !line.startsWith(';'))
    .map((line) => line.split('='))
    .filter((kv) => kv[0]);
}

function num(val: string) {
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

function parseItemsIni() {
  const itemsIni = loadIni('item');

  const defaults = {
    burden: 10000,
    moveable: true,
    stackable: false,
    walkable: true,
  };
  const items = [];

  let currentItem;
  for (const [key, value] of itemsIni) {
    if (key.match(/^item$/i)) {
      currentItem = {
        id: num(value),
        ...defaults,
      };
      items.push(currentItem);
    } else if (!currentItem) {
      // defaults come first.
      defaults[camelCase(key.replace('default', ''))] = value;
    } else if (key.match(/^animation/i)) {
      currentItem.animations = currentItem.animations || [];
      currentItem.animations.push(num(value));
    } else if (key.match(/^notmovable/i)) {
      currentItem.moveable = false;
    } else if (key.match(/^imagetype/i)) {
      currentItem.imageHeight = num(value) + 1;
    } else if (key.match(/^BlockMovement/i)) {
      currentItem.walkable = (value || '1') !== '1';
    } else {
      // Most properties are unchanged, except for being camelCase.
      const camelCaseKey = camelCase(key);

      let convertedValue: any = value;
      const asNumber = num(value);
      if (!Number.isNaN(asNumber)) {
        convertedValue = asNumber;
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
    for (const key of Object.keys(item)) {
      if (!whitelist.includes(key)) {
        delete item[key];
      }
    }
  }

  return items;
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

function run() {
  const items = convertItems();

  const itemsPath = path.join(__dirname, '..', '..', 'world', 'content', 'items.json');
  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
  console.log('saved ' + itemsPath);
}
run();
