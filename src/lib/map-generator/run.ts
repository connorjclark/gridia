// For testing.

import * as fs from 'fs';
import { generate } from './map-generator';
import { makeMapImage } from './map-image-maker';

const mapGenResult = generate({
  width: 400,
  height: 400,
  partitionStrategy: {
    type: 'square',
    size: 15,
    rand: 0.5,
  },
  waterStrategy: {
    type: 'radial',
    radius: 0.9,
  },
});

const svg = makeMapImage(mapGenResult).toBuffer().toString();
fs.writeFileSync('test.svg', svg);
