/// <reference path="../src/types.d.ts" />

import * as assert from 'assert';
import Client from '../src/client';
import { getMetaItem, getMetaItemByName } from '../src/items';
import Server, { openAndConnectToServerInMemory } from '../src/server';
import { equalItems } from '../src/utils';

let client: Client;
let server: Server;
let wire: ClientToServerWire;

// TODO would be cool to see these tests while rendering the game.

beforeEach(() => {
  client = new Client();
  const serverAndWire = openAndConnectToServerInMemory(client, {
    dummyDelay: 0,
    verbose: false,
    fillWorldWithStuff: false,
  });
  wire = serverAndWire.clientToServerWire;
  server = serverAndWire.server;
});

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function setItem(location: Point, item: Item) {
  server.world.getTile(location).item = clone(item);
  client.world.getTile(location).item = clone(item);
}

function assertItemInWorld(location: Point, item: Item) {
  expect(server.world.getItem(location)).toEqual(item);
  expect(client.world.getItem(location)).toEqual(item);
}

function assertItemInWorldNear(location: Point, item: Item) {
  const point = server.findNearest(location, 10, true, (tile) => equalItems(tile.item, item));
  assert(point);
  expect(client.world.getItem(point)).toEqual(item);
}

function assertItemInContainer(containerId: number, index: number, item: Item) {
  expect(server.getContainer(containerId).items[index]).toEqual(item);
  expect(client.world.containers.get(containerId).items[index]).toEqual(item);
}

describe('moveItem', () => {
  assert(getMetaItem(1).stackable);
  assert(getMetaItem(1).moveable);

  it('move item', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };

    setItem(from, { type: 1, quantity: 10 });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    assertItemInWorld(from, null);
    assertItemInWorld(to, { type: 1, quantity: 10 });
  });

  it('fail to move item to non-empty tile', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };

    setItem(from, { type: 1, quantity: 1 });
    setItem(to, { type: 2, quantity: 1 });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    assertItemInWorld(from, { type: 1, quantity: 1 });
    assertItemInWorld(to, { type: 2, quantity: 1 });
  });

  it('move stackable item', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };
    const gold = getMetaItemByName('Gold');

    setItem(from, { type: gold.id, quantity: 1 });
    setItem(to, { type: gold.id, quantity: 2 });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    assertItemInWorld(from, null);
    assertItemInWorld(to, { type: gold.id, quantity: 3 });
  });

  it('move item from world to container', () => {
    const from = { x: 0, y: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.makeContainer();
    wire.send('requestContainer', { containerId: container.id });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: { x: 0, y: 0 },
      toSource: container.id,
    });

    server.consumeAllMessages();

    assertItemInWorld(from, null);
    assertItemInContainer(container.id, 0, { type: 1, quantity: 1 });
  });

  it('move item from world to container: null places in first open slot', () => {
    const from = { x: 0, y: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[3] = { type: 2, quantity: 1 };
    wire.send('requestContainer', { containerId: container.id });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: null,
      toSource: container.id,
    });

    server.consumeAllMessages();

    assertItemInWorld(from, null);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 1 });
  });

  it('move item from world to container: null places in first open slot - stacks', () => {
    const from = { x: 0, y: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[2] = { type: 1, quantity: 2 };
    container.items[3] = { type: 2, quantity: 1 };
    wire.send('requestContainer', { containerId: container.id });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: null,
      toSource: container.id,
    });

    server.consumeAllMessages();

    assertItemInWorld(from, null);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 3 });
  });
});

describe('use', () => {
  beforeEach(() => {
    assert(server.clientConnections[0]);
    assert.equal(getMetaItemByName('Wood Axe').id, server.getContainer(server.clientConnections[0].creature.containerId).items[0].type);
  });

  it('cut down tree', () => {
    const toolIndex = 0;
    const loc = { x: 0, y: 0 };

    setItem(loc, { type: getMetaItemByName('Pine Tree').id, quantity: 1 });

    wire.send('use', {
      toolIndex,
      loc,
    });

    server.consumeAllMessages();

    assertItemInWorld(loc, { type: getMetaItemByName('Pine Tree Stump').id, quantity: 1 });
    assertItemInWorldNear(loc, { type: getMetaItemByName('Small Branches').id, quantity: 6 });
    assertItemInWorldNear(loc, { type: getMetaItemByName('Small Log').id, quantity: 2 });
  });
});
