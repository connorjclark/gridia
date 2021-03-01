// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import * as WireSerializer from '../src/lib/wire-serializer';

class MyCar {
  color = 'red';

  describe() {
    return `I am a ${this.color} car.`;
  }
}
WireSerializer.registerClass(MyCar, 'MyCar');

function roundTrip<T>(object: T) {
  const result = WireSerializer.deserialize<T>(WireSerializer.serialize(object));
  expect(result).toMatchObject(object);
  return result;
}

describe('WireSerializer', () => {
  it('basics', () => {
    roundTrip({ msg: 'hello' });
    roundTrip({ msg: 123 });
    roundTrip({ msg: { larger: 'hello', data: 123 } });
  });

  it('date', () => {
    roundTrip({ msg: new Date() });
  });

  it('class instance', () => {
    const car = new MyCar();
    car.color = 'blue';

    const clonedCar = roundTrip({ car }).car;
    expect(clonedCar.describe()).toBe('I am a blue car.');
  });

  it('map instance', () => {
    const map = new Map();
    map.set(1, { a: 'hello' });
    roundTrip({ map });
  });

  it('map instance with complex values', () => {
    const map = new Map<number, { car: MyCar }>();
    const car = new MyCar();
    car.color = 'blue';
    map.set(1, { car });

    const clonedMap = roundTrip({ map }).map;
    const clonedCar = clonedMap.get(1)?.car;
    expect(clonedCar && clonedCar.describe()).toBe('I am a blue car.');
  });

  it('object instance with map with complex values in array', () => {
    const map = new Map<number, { grid: MyCar[][] }>();
    const object = { map };
    const car = new MyCar();
    car.color = 'blue';
    map.set(1, { grid: [[car]] });

    const clonedMap = roundTrip({ object }).object.map;
    const clonedCar = clonedMap.get(1)?.grid[0][0];
    expect(clonedCar && clonedCar.describe()).toBe('I am a blue car.');
  });
});
