import expect from 'expect';

import {getIndexOffsetForTemplate} from '../src/client/template-draw.js';
import {WorldMapPartition} from '../src/world-map-partition.js';

function parseElevationTemplate(elevationTemplate: string): number[][] {
  return elevationTemplate
    .split('\n')
    .map((l) => l.trim().replace(/ /g, ''))
    .filter(Boolean)
    .map((arr) => [...arr].map(Number));
}

function getElevationOffsetString(elevationTemplate: string) {
  const elevations = parseElevationTemplate(elevationTemplate);

  const partition = WorldMapPartition.createEmptyWorldMapPartition('', 20, 20, 1);
  for (let y = 0; y < elevations.length; y++) {
    for (let x = 0; x < elevations[y].length; x++) {
      const elevation = elevations[y][x];
      partition.getTile({x, y, z: 0}).elevation = elevation;
    }
  }

  const result: number[][] = [];
  for (let y = 0; y < elevations.length; y++) {
    const arr: number[] = [];
    result.push(arr);

    for (let x = 0; x < elevations[y].length; x++) {
      const offset = getIndexOffsetForTemplate(partition, 0, {x, y, z: 0}, {
        templateType: 'elevation-offset',
        file: '',
        frames: [],
      }, 'floor');
      arr.push(offset > 5 ? offset : 0);
    }
  }

  return result;
}

function numbers2dToString(numbers: number[][]) {
  return numbers.map((arr) => arr
    .map((n) => String(n).padEnd(3, ' '))
    .join('')
    .trim()
  ).join('\n');
}

let caseNumber = 1;
function test(elevationTemplate: string, expectedOffsetsString: string) {
  const testName = `case #${caseNumber++}`;
  it(testName, () => {
    expectedOffsetsString = expectedOffsetsString
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');

    const expectedOffsets: number[][] = expectedOffsetsString
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number));

    const actualOffsets = getElevationOffsetString(elevationTemplate);
    const actualOffsetsString = numbers2dToString(actualOffsets);

    let fail = false;
    for (let y = 0; y < expectedOffsets.length; y++) {
      for (let x = 0; x < expectedOffsets[y].length; x++) {
        if (Number.isNaN(expectedOffsets[y][x])) continue;

        if (expectedOffsets[y][x] !== actualOffsets[y][x]) {
          fail = true;
        }
      }
    }

    if (fail) {
      console.log(`\nFAIL ${testName}\n`);
      console.log(`expected:\n\n${expectedOffsetsString}\n\nbut got:\n\n${actualOffsetsString}`);
      expect(false).toBeTruthy();
    }
  });
}

describe('getIndexOffsetForTemplate elevation', () => {
  test(`
    0  0  1  2  2
    0  0  1  2  2
    0  0  1  2  2
    0  0  1  2  2
    0  0  1  2  2
    `, `
    -  -  -  -  -
    0  11 11 0  0
    0  11 11 0  0
    0  11 11 0  0
  `);

  test(`
    3  2  1  0
    3  2  1  0
    3  2  1  0
    3  2  1  0
    3  2  1  0
    `, `
    -  -  -  -  -
    0  14 14 14 -
    0  14 14 14 -
    0  14 14 14 -
  `);

  test(`
    0  1  2  3  4
    0  1  2  3  3
    0  1  2  2  2
    0  1  1  1  1
    `, `
    -  -  -
    -  11 11 7
    -  11 7  8
    -  7  8  8
  `);

  test(`
    0  0  0  1
    0  0  0  1
    0  0  1  1
    0  0  1  1
    0  1  1  1
    `, `
    0  0  11 0
    0  9  19 0
    0  11 0  0
    9  -  0  0
  `);

  test(`
    0  0  0  0  0
    0  0  0  0  0
    0  0  0  1  1
    0  0  1  1  1
    0  0  1  1  1
    0  0  1  1  1
    0  0  0  1  1
    `, `
    0  0  0  0
    0  0  9  17
    0  9  19 0
    0  11 0  0
    0  11 0  0
    0  11 0  0
    0  7  12 0
  `);
});
