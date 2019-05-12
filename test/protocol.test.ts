// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import * as assert from 'assert';
import Client from '../src/client/client';
import { openAndConnectToServerInMemory } from '../src/client/connectToServer';
import { MINE } from '../src/constants';
import { getMetaItem, getMetaItemByName } from '../src/items';
import mapgen from '../src/mapgen';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/serverWorldContext';
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
    context: new ServerContext(mapgen(20, 20, 1, true)),
  });
  wire = serverAndWire.clientToServerWire;
  server = serverAndWire.server;

  // Immediately process messages.
  const originalFn = wire.send;
  wire.send = (...args) => {
    originalFn(...args);
    server.consumeAllMessages();
  };

  // @ts-ignore
  // tslint:disable-next-line: no-empty
  client.PIXISound = {play: () => {}, exists: () => false};

  // Make client make initial request for the sector, so that partial updates are tested later.
  client.context.map.getTile({x: 0, y: 0, z: 0});
  server.consumeAllMessages();
});

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function setItem(location: TilePoint, item: Item) {
  server.context.map.getTile(location).item = clone(item);
  client.context.map.getTile(location).item = clone(item);
}

function setItemInContainer(id: number, index: number, item: Item) {
  server.getContainer(id).items[index] = clone(item);
  client.context.containers.get(id).items[index] = clone(item);
}

function setFloor(location: TilePoint, floor: number) {
  server.context.map.getTile(location).floor = floor;
  client.context.map.getTile(location).floor = floor;
}

function assertItemInWorld(location: TilePoint, item: Item) {
  expect(server.context.map.getItem(location)).toEqual(item);
  expect(client.context.map.getItem(location)).toEqual(item);
}

function assertItemInWorldNear(location: TilePoint, item: Item) {
  const point = server.findNearest(location, 10, true, (tile) => equalItems(tile.item, item));
  assert(point);
  expect(client.context.map.getItem(point)).toEqual(item);
}

function assertItemInContainer(containerId: number, index: number, item: Item) {
  expect(server.getContainer(containerId).items[index]).toEqual(item);
  expect(client.context.containers.get(containerId).items[index]).toEqual(item);
}

function assertCreatureAt(location: TilePoint, creatureId: number) {
  let creature;

  creature = server.context.getCreature(creatureId);
  expect(creature.pos).toEqual(location);
  expect(server.context.map.getTile(location).creature).toEqual(creature);

  creature = client.context.getCreature(creatureId);
  expect(creature.pos).toEqual(location);
  expect(client.context.map.getTile(location).creature).toEqual(creature);
}

describe('move', () => {
  let creature;
  beforeEach(() => {
    creature = server.context.getCreature(client.creatureId);
    server.moveCreature(creature, {x: 5, y: 5, z: 0});
    server.consumeAllMessages();
  });

  it('player can move to open space', () => {
    const from = {x: 5, y: 5, z: 0};
    const to = {x: 6, y: 5, z: 0};

    assertCreatureAt(from, creature.id);
    wire.send('move', to);
    assertCreatureAt(to, creature.id);
  });

  it('player can move to walkable item', () => {
    const from = {x: 5, y: 5, z: 0};
    const to = {x: 6, y: 5, z: 0};
    setItem(to, { type: 1, quantity: getMetaItemByName('Cut Red Rose').id });

    assertCreatureAt(from, creature.id);
    wire.send('move', to);
    assertCreatureAt(to, creature.id);
  });

  it('player can not move to unwalkable item', () => {
    const from = {x: 5, y: 5, z: 0};
    const to = {x: 6, y: 5, z: 0};
    setItem(to, { type: getMetaItemByName('Granite Wall').id, quantity: 1 });

    assertCreatureAt(from, creature.id);
    wire.send('move', to);
    assertCreatureAt(from, creature.id);
  });

  // TODO broadcast new creatures.
  // it('player can not move where other creature is', () => {
  //   const from = {x: 5, y: 5, z: 0};
  //   const to = {x: 6, y: 5, z: 0};
  //   const otherCreature = server.makeCreature(to);
  //   assertCreatureAt(to, otherCreature.id);

  //   assertCreatureAt(from, creature.id);
  //   wire.send('move', to);
  //   assertCreatureAt(from, creature.id);
  // });

  // TODO refactor "server.makeCreature" to not give items.
  // it('player can not move to mine wall without pickaxe in inventory', () => {
  //   const from = {x: 5, y: 5, z: 0};
  //   const to = {x: 6, y: 5, z: 0};
  //   setFloor(to, MINE);

  //   assertCreatureAt(from, creature.id);
  //   wire.send('move', to);
  //   assertCreatureAt(from, creature.id);
  // });

  it('player can move to mine wall with pickaxe in inventory', () => {
    const from = {x: 5, y: 5, z: 0};
    const to = {x: 6, y: 5, z: 0};
    setFloor(to, MINE);

    assertCreatureAt(from, creature.id);
    wire.send('move', to);
    assertCreatureAt(to, creature.id);
  });
});

describe('moveItem', () => {
  assert(getMetaItem(1).stackable);
  assert(getMetaItem(1).moveable);

  it('move item', () => {
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 1, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 10 });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    assertItemInWorld(from, null);
    assertItemInWorld(to, { type: 1, quantity: 10 });
  });

  it('fail to move item to non-empty tile', () => {
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 1, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    setItem(to, { type: 2, quantity: 1 });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    assertItemInWorld(from, { type: 1, quantity: 1 });
    assertItemInWorld(to, { type: 2, quantity: 1 });
  });

  it('move stackable item', () => {
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 1, y: 0, z: 0 };
    const gold = getMetaItemByName('Gold');

    setItem(from, { type: gold.id, quantity: 1 });
    setItem(to, { type: gold.id, quantity: 2 });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    assertItemInWorld(from, null);
    assertItemInWorld(to, { type: gold.id, quantity: 3 });
  });

  it('move item from world to container', () => {
    const from = { x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.makeContainer();
    wire.send('requestContainer', { containerId: container.id });

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: { x: 0, y: 0, z: 0 },
      toSource: container.id,
    });

    assertItemInWorld(from, null);
    assertItemInContainer(container.id, 0, { type: 1, quantity: 1 });
  });

  it('move item from world to container: null places in first open slot', () => {
    const from = { x: 0, y: 0, z: 0 };

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

    assertItemInWorld(from, null);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 1 });
  });

  it('move item from world to container: null places in first open slot - stacks', () => {
    const from = { x: 0, y: 0, z: 0 };

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

    assertItemInWorld(from, null);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 3 });
  });
});

describe('use', () => {
  let container;

  beforeEach(() => {
    assert(server.clientConnections[0]);
    container = server.clientConnections[0].container;
    // TODO don't rely on this hardcoded.
    assert.equal(getMetaItemByName('Wood Axe').id, container.items[0].type);
    assert.equal(getMetaItemByName('Mana Plant Seeds').id, container.items[4].type);
    assert.equal(100, container.items[4].quantity);
  });

  it('cut down tree', () => {
    const toolIndex = 0;
    const loc = { x: 0, y: 0, z: 0 };

    setItem(loc, { type: getMetaItemByName('Pine Tree').id, quantity: 1 });

    wire.send('use', {
      toolIndex,
      loc,
    });

    assertItemInWorld(loc, { type: getMetaItemByName('Pine Tree Stump').id, quantity: 1 });
    assertItemInWorldNear(loc, { type: getMetaItemByName('Small Branches').id, quantity: 6 });
    assertItemInWorldNear(loc, { type: getMetaItemByName('Small Log').id, quantity: 2 });
  });

  it('plant a seed', () => {
    const toolIndex = 4;
    const loc = { x: 0, y: 0, z: 0 };

    setItem(loc, { type: getMetaItemByName('Ploughed Ground').id, quantity: 1 });

    wire.send('use', {
      toolIndex,
      loc,
    });

    assertItemInWorld(loc, { type: getMetaItemByName('Mana Plant Seeded Ground').id, quantity: 1 });
    assertItemInContainer(container.id, toolIndex, {
      type: getMetaItemByName('Mana Plant Seeds').id,
      quantity: 99,
    });
  });

  it('cook food', () => {
    const toolIndex = 0;
    const loc = { x: 0, y: 0, z: 0 };

    setItemInContainer(container.id, toolIndex, {
      type: getMetaItemByName('Un-Cooked Large Ribs').id,
      quantity: 5,
    });
    setItemInContainer(container.id, toolIndex + 1, null);
    setItem(loc, { type: getMetaItemByName('Large Camp Fire').id, quantity: 1 });

    wire.send('use', {
      toolIndex,
      loc,
    });

    assertItemInWorld(loc, { type: getMetaItemByName('Large Camp Fire').id, quantity: 1 });
    assertItemInContainer(container.id, toolIndex, {
      type: getMetaItemByName('Un-Cooked Large Ribs').id,
      quantity: 4,
    });
    // Cooked ribs should be placed in the container.
    assertItemInContainer(container.id, toolIndex + 1, {
      type: getMetaItemByName('Cooked Large Ribs').id,
      quantity: 1,
    });
  });
});
