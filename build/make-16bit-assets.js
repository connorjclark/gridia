// This script converts the (purchased) assets from https://www.oryxdesignlab.com/products/16-bit-fantasy-tileset
// into spritesheets / gridia world data.

const fs = require('fs');
const { execFileSync } = require('child_process');

const dir = '/Users/connorclark/Downloads/oryx_16-bit_fantasy_1.1';

function runImageMagick(args) {
  return execFileSync('magick', args, { encoding: 'utf-8' });
}

// Manually restich into a spritesheet.
// Didn't like how the multi-tile objects didn't line up, so not using.
// const images = glob
//   .sync(`${dir}/Sliced/world_24x24/*.png`)
//   .sort((a, b) => {
//     a = Number(a.match(/(\d+)\.png/)[1]);
//     b = Number(b.match(/(\d+)\.png/)[1]);
//     return a - b;
//   });
// runImageMagick([
//   'montage',
//   '-background', 'transparent',
//   '-geometry', '24x24',
//   '-tile', '27x',
//   ...images,
//   'build/output.png',
// ]);

// Instead, let's just crop out the extra space in the "almost" spritesheet.
const size = 24;
runImageMagick([
  'convert',
  '-crop', `${size * 27}x${size * 39}+${size}+${size}`,
  `${dir}/oryx_16bit_fantasy_world_trans.png`,
  'worlds/16bit-world/graphics/world_001.png',
]);
runImageMagick([
  'convert',
  '-crop', `${size * 27}x${size * 39}+${size * 29}+${size}`,
  `${dir}/oryx_16bit_fantasy_world_trans.png`,
  'worlds/16bit-world/graphics/world_002.png',
]);

const floors = [];
for (let y = 0; y <= 20; y++) {
  for (let x = 3; x <= 6; x++) {
    floors.push({
      id: floors.length,
      color: '0',
      graphics: { file: 'world_001.png', frames: [x + y * 27] },
    });
  }
}

const items = [];
const itemUses = [];
items.push({
  "id": 0,
  "name": "Nothing",
  "class": "Normal",
  "blocksLight": false,
  "burden": 0,
  "graphics": {
    "file": "world_001.png",
    "frames": [
      1
    ]
  },
  "light": 0,
  "moveable": true,
  "stackable": false,
});
items.push({
  id: items.length,
  name: 'Wall',
  graphics: {file: 'world_001.png', frames: [9], templateType: 'misc-offset-1'},
  blocksMovement: true,
});
items.push({
  id: items.length,
  name: 'Tree',
  graphics: {
    file: 'world_002.png', frames: [3*27 + 15],
    templateType: 'data-offset',
    templateData: {
      0: 3*27 + 15,

      rb: 4*27 + 15,
      lrb: 4*27 + 16,
      lb: 4*27 + 17,

      rab: 5*27 + 15,
      lrab: 5*27 + 16,
      lab: 5*27 + 17,

      ra: 6*27 + 15,
      lra: 6*27 + 16,
      la: 6*27 + 17,
    },
  },
  blocksMovement: true,
});
items.push({
  id: items.length,
  name: 'Rock',
  graphics: {
    file: 'world_002.png', frames: [2*27 + 17],
    templateType: 'data-offset',
    templateData: {
      0: 2*27 + 17,

      rb: 9*27 + 18,
      lrb: 9*27 + 19,
      lb: 9*27 + 20,

      rab: 10*27 + 18,
      lrab: 10*27 + 19,
      lab: 10*27 + 20,

      ra: 11*27 + 18,
      lra: 11*27 + 19,
      la: 11*27 + 20,
    },
  },
  blocksMovement: true,
});
items.push({
  id: items.length,
  name: 'Tree Stump',
  graphics: {file: 'world_002.png', frames: [100]},
  blocksMovement: true,
});
items.push({
  id: items.length,
  name: 'Woodcutting Axe',
  graphics: {file: 'items_001.png', frames: [167]},
  blocksMovement: true,
});
items.push({
  id: items.length,
  name: 'Branches',
  graphics: {file: 'items_001.png', frames: [178]},
  blocksMovement: true,
  stackable: true,
});
itemUses.push({
  tool: items.findIndex(item => item.name === 'Woodcutting Axe'),
  focus: items.findIndex(item => item.name === 'Tree'),
  focusQuantityConsumed: 1,
  products: [
    {type: items.findIndex(item => item.name === 'Tree Stump'), quantity: 1},
    {type: items.findIndex(item => item.name === 'Branches'), quantity: 3},
  ],
});

// items.push({
//   id: items.length,
//   name: 'Mountain',
//   graphics: {
//     file: 'world_001.png', frames: [4*27 + 15],
//     templateType: 'cardinal',
//     templateData: [
//       {frame: 4*27 + 15, r: true, b: true},
//       {frame: 4*27 + 15, l: true, r: true, b: true},
//     ],
//   },
// });

runImageMagick([
  'convert',
  '-crop', `${size * 18}x${size * 23}+${size}+${size}`,
  `${dir}/oryx_16bit_fantasy_creatures_trans.png`,
  'worlds/16bit-world/graphics/creatures_001.png',
]);

const creatureNames = require('./16bit-creature-names.json');
const creatures = [null];
for (let i = 0; i < 100; i++) {
  const x = i % 18;
  const y = Math.floor(i / 18) * 2;
  const index = x + y * 18;

  creatures.push({
    id: i + 1,
    name: creatureNames[i],
    graphics: { file: 'creatures_001.png', frames: [index, index + 18] },
  });
}

runImageMagick([
  'convert',
  '+set', 'date:modify',
  '-crop', `${16 * 22}x${16 * 14}+16+16`,
  '-interpolate', 'Integer',
  '-filter', 'point',
  '-resize', `${size * 22}x${size * 14}`,
  `${dir}/oryx_16bit_fantasy_items_trans.png`,
  'worlds/16bit-world/graphics/items_001.png',
]);

for (let i = 0; i < 22 * 14; i++) {
  items.push({
    id: items.length,
    name: 'Unamed item',
    graphics: {file: 'items_001.png', frames: [i]},
  });
}

fs.writeFileSync('worlds/16bit-world/content/floors.json', JSON.stringify(floors, null, 2));
fs.writeFileSync('worlds/16bit-world/content/monsters.json', JSON.stringify(creatures, null, 2));
fs.writeFileSync('worlds/16bit-world/content/items.json', JSON.stringify(items, null, 2));
fs.writeFileSync('worlds/16bit-world/content/itemuses.json', JSON.stringify(itemUses, null, 2));
