// For testing.

import { generate } from './map-generator';
import { save } from './map-image-saver';

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

save(mapGenResult, 'test.svg');
