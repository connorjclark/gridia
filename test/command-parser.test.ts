// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import * as CommandParser from '../src/lib/command-parser';

describe('command parser', () => {
  it('single number arg', () => {
    const args = CommandParser.parseArgs('1', [{name: 'a1', type: 'number'}]);
    expect(args).toMatchObject({a1: 1});
  });

  it('single string arg', () => {
    const args = CommandParser.parseArgs('hello', [{name: 'a1', type: 'string'}]);
    expect(args).toMatchObject({a1: 'hello'});
  });

  it('single string arg with quotes', () => {
    const args = CommandParser.parseArgs('"hello"', [{name: 'a1', type: 'string'}]);
    expect(args).toMatchObject({a1: 'hello'});
  });

  it('two string args with quotes', () => {
    const args = CommandParser.parseArgs('"hello" "and goodbye"', [
      {name: 'a1', type: 'string'},
      {name: 'a2', type: 'string'},
    ]);
    expect(args).toMatchObject({a1: 'hello',  a2: 'and goodbye'});
  });

  it('two number args', () => {
    const args = CommandParser.parseArgs('1 2', [
      {name: 'a1', type: 'number'},
      {name: 'a2', type: 'number'},
    ]);
    expect(args).toMatchObject({a1: 1, a2: 2});
  });

  it('two number args, missing one', () => {
    const args = CommandParser.parseArgs('1', [
      {name: 'a1', type: 'number'},
      {name: 'a2', type: 'number'},
    ]);
    expect(args).toMatchObject({error: 'missing required argument a2'});
  });

  it('two number args, one optional, missing one', () => {
    const args = CommandParser.parseArgs('1', [
      {name: 'a1', type: 'number'},
      {name: 'a2', type: 'number', optional: true},
    ]);
    expect(args).toMatchObject({a1: 1});
  });
});
