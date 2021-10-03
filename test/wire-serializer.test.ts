import * as WireSerializer from '../src/lib/wire-serializer.js';

function roundTrip<T>(object: T) {
  const result = WireSerializer.deserialize<T>(WireSerializer.serialize(object));
  expect(result).toMatchObject(object);
  return result;
}

describe('WireSerializer', () => {
  it('basics', () => {
    roundTrip({msg: 'hello'});
    roundTrip({msg: 123});
    roundTrip({msg: {larger: 'hello', data: 123}});
  });

  it('date', () => {
    roundTrip({msg: new Date()});
  });

  it('map instance', () => {
    const map = new Map();
    map.set(1, {a: 'hello'});
    roundTrip({map});
  });

  it('Uint16Array', () => {
    roundTrip(new Uint16Array([1, 2, 3, 4, 1000, 65535]));
    // underlying buffer is slightly bigger, so jest considers it not equal.
    // roundTrip(new Uint16Array([2, 3, 4, 1000, 65535]));
  });

  it('map instance with complex values', () => {
    const map = new Map<number, { car: { color: string } }>();
    map.set(1, {car: {color: 'blue'}});

    const clonedMap = roundTrip({map}).map;
    const clonedCar = clonedMap.get(1)?.car;
    expect(clonedCar && clonedCar.color).toBe('blue');
  });

  it('object instance with map with complex values in array', () => {
    const map = new Map<number, { grid: Array<Array<{ color: string }>> }>();
    const object = {map};
    const car = {color: 'blue'};
    map.set(1, {grid: [[car]]});

    const clonedMap = roundTrip({object}).object.map;
    const clonedCar = clonedMap.get(1)?.grid[0][0];
    expect(clonedCar && clonedCar.color).toBe('blue');
  });
});
