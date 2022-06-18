import expect from 'expect';

import {sniffObject, SniffedOperation} from '../src/lib/sniff-object.js';
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
    expect(ops).toEqual([{path: '.name', newValue: 'renamed'}]);
    expect(sniffer.name).toEqual('renamed');
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
    expect(ops).toEqual([{path: '.nested.name', newValue: 'renamed'}]);
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
      op.newValue = clone(op.newValue);
      ops.push(op);
    });
    sniffer.nested = {name: 'renamed'};
    sniffer.nested.name = 'renamed again';
    expect(ops).toEqual([
      {path: '.nested', newValue: {name: 'renamed'}},
      {path: '.nested.name', newValue: 'renamed again'},
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
      {path: '.values.0.entry', newValue: 1},
      {path: '.values.4', newValue: {entry: 4}},
      {path: '.values', splice: {start: 0, deleteCount: 1, items: [{entry: 100}]}},
      {path: '.values.0.entry', newValue: 101},
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
      // {path: '.values.1', newValue: {entry: 100}},
      // {path: '.values.3', newValue: {entry: 300}},
      {path: '.values', newValue: [
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
      // {path: '.values.length', newValue: 2},
      {path: '.values', newValue: [
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
      op.newValue = clone(op.newValue);
      ops.push(op);
    });

    sniffer.values = sniffer.values.filter((_, i) => {
      return i % 2;
    });
    sniffer.values[1].entry *= 100;
    expect(ops).toEqual([
      // {path: '.values', deleteIndices: [0, 2]},
      {path: '.values', newValue: [{entry: 1}, {entry: 3}]},
      {path: '.values.1.entry', newValue: 300},
    ]);
    expect(object.values).toEqual([
      {entry: 1},
      {entry: 300},
    ]);
  });
});
