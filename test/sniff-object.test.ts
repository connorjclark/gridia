import expect from 'expect';

import {sniffObject, SniffedOperation, replaySniffedOperations} from '../src/lib/sniff-object.js';
import {clone} from '../src/utils.js';

describe('sniffObject', () => {
  it('basic', () => {
    const object = {
      name: 'name',
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      ops.push(op);
    });
    sniffer.name = 'renamed';
    expect(ops).toEqual([{path: '.name', value: 'renamed'}]);
    expect(sniffer.name).toEqual('renamed');
  });

  it('ignores same value', () => {
    const object = {
      name: 'name',
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      ops.push(op);
    });
    sniffer.name = 'name';
    expect(ops).toEqual([]);
    expect(sniffer.name).toEqual('name');
  });

  it('nested', () => {
    const object = {
      nested: {
        name: 'name',
      },
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      ops.push(op);
    });
    sniffer.nested.name = 'renamed';
    expect(ops).toEqual([{path: '.nested.name', value: 'renamed'}]);
    expect(sniffer.nested.name).toEqual('renamed');
  });

  it('recursive', () => {
    const object = {
      nested: {
        name: 'name',
      },
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });
    sniffer.nested = {name: 'renamed'};
    sniffer.nested.name = 'renamed again';
    expect(ops).toEqual([
      {path: '.nested', value: {name: 'renamed'}},
      {path: '.nested.name', value: 'renamed again'},
    ]);
    expect(sniffer.nested.name).toEqual('renamed again');
  });

  it('array', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.splice = clone(op.splice);
      ops.push(op);
    });

    sniffer.values[0].entry = 1;
    sniffer.values.push({entry: 4});
    sniffer.values.splice(0, 1, {entry: 100});
    sniffer.values[0].entry = 101;
    expect(ops).toEqual([
      {path: '.values.0.entry', value: 1},
      {path: '.values.4', value: {entry: 4}},
      {path: '.values', splice: {start: 0, deleteCount: 1, items: [{entry: 100}]}},
      {path: '.values.0.entry', value: 101},
    ]);
  });

  it('array.map', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.splice = clone(op.splice);
      ops.push(op);
    });

    sniffer.values = sniffer.values.map((value, i) => {
      return i % 2 ? {entry: value.entry * 100} : value;
    });
    expect(ops).toEqual([
      // {path: '.values.1', value: {entry: 100}},
      // {path: '.values.3', value: {entry: 300}},
      {path: '.values', value: [
        {entry: 0},
        {entry: 100},
        {entry: 2},
        {entry: 300},
      ]},
    ]);
  });

  it('array set smaller length', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.splice = clone(op.splice);
      ops.push(op);
    });

    sniffer.values = [
      object.values[0],
      object.values[1],
    ];
    expect(ops).toEqual([
      // {path: '.values.length', value: 2},
      {path: '.values', value: [
        {entry: 0},
        {entry: 1},
      ]},
    ]);
  });

  it('array.filter', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });

    sniffer.values = sniffer.values.filter((_, i) => {
      return i % 2;
    });
    sniffer.values[1].entry *= 100;
    expect(ops).toEqual([
      {path: '.values', deleteIndices: [0, 2]},
      {path: '.values.1.entry', value: 300},
    ]);
    expect(object.values).toEqual([
      {entry: 1},
      {entry: 300},
    ]);
  });

  it('array.filter deferred', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });

    const newValues = sniffer.values.filter((_, i) => {
      return i % 2;
    });
    newValues[1].entry *= 100;
    sniffer.values = newValues;

    expect(ops).toEqual([
      {path: '.values', deleteIndices: [0, 2]},
      {path: '.values.1.entry', value: 300},
    ]);
    expect(object.values).toEqual([
      {entry: 1},
      {entry: 300},
    ]);
  });

  it('array.filter repeated', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });

    sniffer.values = sniffer.values
      .filter((_, i) => i % 2)
      .filter((value) => value.entry > 2);

    expect(ops).toEqual([
      {path: '.values', deleteIndices: [0, 2]},
      {path: '.values', deleteIndices: [0]},
    ]);
    expect(object.values).toEqual([
      {entry: 3},
    ]);
  });

  it('array items moved around', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });

    const itemA = sniffer.values[1];
    const itemB = sniffer.values[3];
    itemA.entry *= 100;
    itemB.entry *= 100;
    sniffer.values[1] = itemB;
    sniffer.values[3] = itemA;

    expect(ops).toEqual([
      {path: '.values.1.entry', value: 100},
      {path: '.values.3.entry', value: 300},
      {path: '.values.1', value: {entry: 300}},
      {path: '.values.3', value: {entry: 100}},
    ]);
    expect(object.values).toEqual([
      {entry: 0},
      {entry: 300},
      {entry: 2},
      {entry: 100},
    ]);
  });

  it('array items moved around complex', () => {
    const object = {
      values: [
        {entries: [0]},
        {entries: [1]},
        {entries: [2]},
        {entries: [3]},
      ],
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });

    const itemA = sniffer.values[1];
    const itemB = sniffer.values[3];
    itemA.entries[0] *= 100;
    itemB.entries[0] *= 100;
    itemB.entries = itemB.entries.filter((value) => false);
    sniffer.values[1] = itemB;
    sniffer.values[3] = itemA;

    expect(ops).toEqual([
      {path: '.values.1.entries.0', value: 100},
      {path: '.values.3.entries.0', value: 300},
      {path: '.values.3.entries', deleteIndices: [0]},
      {path: '.values.1', value: {entries: []}},
      {path: '.values.3', value: {entries: [100]}},
    ]);
    expect(object.values).toEqual([
      {entries: [0]},
      {entries: []},
      {entries: [2]},
      {entries: [100]},
    ]);
  });

  it('Map', () => {
    const object = {
      map: new Map([
        [0, {entry: 0}],
        [1, {entry: 1}],
        [2, {entry: 2}],
        [3, {entry: 3}],
      ]),
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      op.value = clone(op.value);
      ops.push(op);
    });

    sniffer.map.delete(0);
    sniffer.map.set(1, {entry: 100});
    const value = sniffer.map.get(1);
    if (value) value.entry = 101;

    expect(ops).toEqual([
      {path: '.map', delete: 0},
      {path: '.map.1', value: {entry: 100}},
      {path: '.map.1.entry', value: 101},
    ]);
    expect(object.map).toEqual(new Map([
      [1, {entry: 101}],
      [2, {entry: 2}],
      [3, {entry: 3}],
    ]));

    sniffer.map.clear();
    expect(ops.slice(3)).toEqual([
      {path: '.map', clear: true},
    ]);
    expect(object.map).toEqual(new Map());
  });

  it('Set', () => {
    const object = {
      set: new Set([0, 1, 2, 3]),
    };
    const ops: SniffedOperation[] = [];
    const sniffer = sniffObject(object, (op) => {
      ops.push(op);
    });

    sniffer.set.delete(0);
    sniffer.set.add(100);

    expect(ops).toEqual([
      {path: '.set', delete: 0},
      {path: '.set', add: 100},
    ]);
    expect(object.set).toEqual(new Set([1, 2, 3, 100]));
  });
});

describe('replaySniffedOperations', () => {
  it('basic', () => {
    const object = {
      name: 'name',
    };
    replaySniffedOperations(object, [
      {path: '.name', value: 'renamed'},
    ]);
    expect(object.name).toEqual('renamed');
  });

  it('can set to undefined', () => {
    const object = {
      name: 'name',
    };
    replaySniffedOperations(object, [
      {path: '.name'},
    ]);
    expect(object.name).toEqual(undefined);
  });

  it('nested', () => {
    const object = {
      nested: {
        name: 'name',
      },
    };
    replaySniffedOperations(object, [
      {path: '.nested.name', value: 'renamed'},
    ]);
    expect(object.nested.name).toEqual('renamed');
  });

  it('array', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    replaySniffedOperations(object, [
      {path: '.values.1.entry', value: 100},
      {path: '.values.4', value: {entry: 4}},
      {path: '.values', splice: {start: 2, deleteCount: 1, items: [{entry: 200}]}},
    ]);
    expect(object.values).toEqual([
      {entry: 0},
      {entry: 100},
      {entry: 200},
      {entry: 3},
      {entry: 4},
    ]);
  });

  it('array deleteIndices', () => {
    const object = {
      values: [
        {entry: 0},
        {entry: 1},
        {entry: 2},
        {entry: 3},
      ],
    };
    replaySniffedOperations(object, [
      {path: '.values', deleteIndices: [0, 2]},
    ]);
    expect(object.values).toEqual([
      {entry: 1},
      {entry: 3},
    ]);
  });

  it('add properties if missing', () => {
    const object: any = {};
    replaySniffedOperations(object, [
      {path: '.nested.name', value: 'renamed'},
    ]);
    expect(object.nested.name).toEqual('renamed');
  });

  it('Map', () => {
    const object = {
      map: new Map([
        [0, {entry: 0}],
        [1, {entry: 1}],
        [2, {entry: 2}],
        [3, {entry: 3}],
      ]),
    };
    replaySniffedOperations(object, [
      {path: '.map', delete: 0},
      {path: '.map.1', value: {entry: 100}},
      {path: '.map.1.entry', value: 101},
    ]);
    expect(object.map).toEqual(new Map([
      [1, {entry: 101}],
      [2, {entry: 2}],
      [3, {entry: 3}],
    ]));
  });

  it('Set', () => {
    const object = {
      set: new Set([0, 1, 2, 3]),
    };
    replaySniffedOperations(object, [
      {path: '.set', delete: 0},
      {path: '.set', add: 100},
    ]);
    expect(object.set).toEqual(new Set([1, 2, 3, 100]));
  });
});
