// yarn build-server && rm -rf world/graphics && node dist/server/scripts/create-graphics.js

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as glob from 'glob';

const graphicsManifest = [];

fs.mkdirSync('world/graphics', { recursive: true });
fs.mkdirSync('.tmp', { recursive: true });

for (const file of glob.sync('assets/**/*.{png,bmp}')) {
  const result = execFileSync('magick', [
    'identify', '-ping', '-format', '%w %h', file,
  ], { encoding: 'utf-8' });
  const [width, height] = result.split(' ').map(Number);
  if (width > 4096 || height > 4096) {
    throw new Error('greater than max texture size: ' + file);
  }

  let name;
  if (file.includes('rpgwo')) {
    if (file.includes('background')) continue;
    if (file.includes('wearing')) continue;
    if (file.includes('util')) continue;

    const split = file.split('/');
    name = `rpgwo-${split[split.length - 1]}`;
    name = name.replace('.bmp', '.png');
    name = name.replace('sheild', 'shield');
    name = name.replace('animation', 'animations');
  } else {
    const split = file.split('/');
    name = split[split.length - 1];
  }

  const newPath = `world/graphics/${name}`;
  if (file.endsWith('.bmp')) {
    execFileSync('convert', [
      file,
      '-format', 'png',
      '-quality', '93',
      '-transparent', 'white',
      newPath,
    ]);
  } else {
    fs.copyFileSync(file, newPath);
  }

  graphicsManifest.push({ file: newPath, width, height });
}

console.log(JSON.stringify(graphicsManifest, null, 2));
