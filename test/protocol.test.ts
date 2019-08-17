// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

import * as assert from 'assert';
import Client from '../src/client/client';
import { Connection } from '../src/client/connection';
import { MINE } from '../src/constants';
import * as Content from '../src/content';
import mapgen from '../src/mapgen';
import * as ProtocolBuilder from '../src/protocol/client-to-server-protocol-builder';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import { equalItems } from '../src/utils';
import WorldMap from '../src/world-map';
import { openAndConnectToServerInMemory } from './server-in-memory';

let client: Client;
let server: Server;
let connection: Connection;

// TODO would be cool to see these tests while rendering the game.

beforeEach(async () => {
  client = new Client();
  const worldMap = new WorldMap();
  const partition = mapgen(20, 20, 1, true);
  worldMap.addPartition(0, partition);
  const serverAndConnection = await openAndConnectToServerInMemory(client, {
    dummyDelay: 0,
    verbose: false,
    context: new ServerContext(worldMap),
  });
  connection = serverAndConnection.connection;
  server = serverAndConnection.server;

  // Immediately process messages.
  const originalFn = connection.send.bind(connection);
  connection.send = (...args) => {
    originalFn(...args);
    server.consumeAllMessages();
  };

  server.context.savePlayer = () => Promise.resolve();

  connection.send(ProtocolBuilder.register({
    name: 'test-user',
  }));

  // @ts-ignore
  // tslint:disable-next-line: no-empty
  client.PIXISound = {play: () => {}, exists: () => false};

  // Make client make initial request for the sector, so that partial updates are tested later.
  partition.getTile({x: 0, y: 0, z: 0});
  server.consumeAllMessages();
});

function clone<T>(obj: T): T {
  if (obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function setItem(location: TilePoint, item: Item) {
  server.context.map.getTile(location).item = clone(item);
  client.context.map.getTile(location).item = clone(item);
}

function setItemInContainer(id: number, index: number, item: Item) {
  server.context.getContainer(id).items[index] = clone(item);
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
  expect(server.context.getContainer(containerId).items[index]).toEqual(item);
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
    server.moveCreature(creature, {w: 0, x: 5, y: 5, z: 0});
    server.consumeAllMessages();
  });

  it('player can move to open space', () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};

    assertCreatureAt(from, creature.id);
    connection.send(ProtocolBuilder.move(to));
    assertCreatureAt(to, creature.id);
  });

  it('player can move to walkable item', () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};
    setItem(to, { type: 1, quantity: Content.getMetaItemByName('Cut Red Rose').id });

    assertCreatureAt(from, creature.id);
    connection.send(ProtocolBuilder.move(to));
    assertCreatureAt(to, creature.id);
  });

  it('player can not move to unwalkable item', () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};
    setItem(to, { type: Content.getMetaItemByName('Granite Wall').id, quantity: 1 });

    assertCreatureAt(from, creature.id);
    connection.send(ProtocolBuilder.move(to));
    assertCreatureAt(from, creature.id);
  });

  // TODO broadcast new creatures.
  // it('player can not move where other creature is', () => {
  //   const from = {x: 5, y: 5, z: 0};
  //   const to = {x: 6, y: 5, z: 0};
  //   const otherCreature = server.makeCreature(to);
  //   assertCreatureAt(to, otherCreature.id);

  //   assertCreatureAt(from, creature.id);
  //   connection.send(ProtocolBuilder.move(to));
  //   assertCreatureAt(from, creature.id);
  // });

  // TODO refactor "server.makeCreature" to not give items.
  // it('player can not move to mine wall without pickaxe in inventory', () => {
  //   const from = {x: 5, y: 5, z: 0};
  //   const to = {x: 6, y: 5, z: 0};
  //   setFloor(to, MINE);

  //   assertCreatureAt(from, creature.id);
  //   connection.send(ProtocolBuilder.move(to));
  //   assertCreatureAt(from, creature.id);
  // });

  it('player can move to mine wall with pickaxe in inventory', () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};
    setFloor(to, MINE);

    assertCreatureAt(from, creature.id);
    connection.send(ProtocolBuilder.move(to));
    assertCreatureAt(to, creature.id);
  });
});

describe('moveItem', () => {
  assert(Content.getMetaItem(1).stackable);
  assert(Content.getMetaItem(1).moveable);

  it('move item', () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };
    const to = { w: 0, x: 1, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 10 });

    connection.send(ProtocolBuilder.moveItem({
      from,
      fromSource: 0,
      to,
      toSource: 0,
    }));

    assertItemInWorld(from, undefined);
    assertItemInWorld(to, { type: 1, quantity: 10 });
  });

  it('fail to move item to non-empty tile', () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };
    const to = { w: 0, x: 1, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    setItem(to, { type: 2, quantity: 1 });

    connection.send(ProtocolBuilder.moveItem({
      from,
      fromSource: 0,
      to,
      toSource: 0,
    }));

    assertItemInWorld(from, { type: 1, quantity: 1 });
    assertItemInWorld(to, { type: 2, quantity: 1 });
  });

  it('move stackable item', () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };
    const to = { w: 0, x: 1, y: 0, z: 0 };
    const gold = Content.getMetaItemByName('Gold');

    setItem(from, { type: gold.id, quantity: 1 });
    setItem(to, { type: gold.id, quantity: 2 });

    connection.send(ProtocolBuilder.moveItem({
      from,
      fromSource: 0,
      to,
      toSource: 0,
    }));

    assertItemInWorld(from, undefined);
    assertItemInWorld(to, { type: gold.id, quantity: 3 });
  });

  it('move item from container to world', () => {
    const to = { w: 0, x: 0, y: 0, z: 0 };

    const container = server.context.makeContainer();
    container.items[0] = { type: 1, quantity: 1 };
    connection.send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    connection.send(ProtocolBuilder.moveItem({
      from: {w: 0, x: 0, y: 0, z: 0},
      fromSource: container.id,
      to,
      toSource: 0,
    }));

    assertItemInWorld(to, { type: 1, quantity: 1 });
    assertItemInContainer(container.id, 0, undefined);
  });

  it('move item from world to container', () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.context.makeContainer();
    connection.send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    connection.send(ProtocolBuilder.moveItem({
      from,
      fromSource: 0,
      to: { w: 0, x: 0, y: 0, z: 0 },
      toSource: container.id,
    }));

    assertItemInWorld(from, undefined);
    assertItemInContainer(container.id, 0, { type: 1, quantity: 1 });
  });

  it('move item from world to container: no "to" places in first open slot', () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.context.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[3] = { type: 2, quantity: 1 };
    connection.send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    connection.send(ProtocolBuilder.moveItem({
      from,
      fromSource: 0,
      toSource: container.id,
    }));

    assertItemInWorld(from, undefined);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 1 });
  });

  it('move item from world to container: no "to" places in first open slot - stacks', () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.context.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[2] = { type: 1, quantity: 2 };
    container.items[3] = { type: 2, quantity: 1 };
    connection.send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    connection.send(ProtocolBuilder.moveItem({
      from,
      fromSource: 0,
      toSource: container.id,
    }));

    assertItemInWorld(from, undefined);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 3 });
  });
});

describe('use', () => {
  let container;

  beforeEach(() => {
    assert(server.clientConnections[0]);
    container = server.clientConnections[0].container;
    // TODO don't rely on this hardcoded.
    assert.equal(Content.getMetaItemByName('Wood Axe').id, container.items[0].type);
    assert.equal(Content.getMetaItemByName('Mana Plant Seeds').id, container.items[4].type);
    assert.equal(100, container.items[4].quantity);
  });

  it('cut down tree', () => {
    const toolIndex = 0;
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItem(loc, { type: Content.getMetaItemByName('Pine Tree').id, quantity: 1 });

    connection.send(ProtocolBuilder.use({
      toolIndex,
      loc,
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Pine Tree Stump').id, quantity: 1 });
    assertItemInWorldNear(loc, { type: Content.getMetaItemByName('Small Branches').id, quantity: 6 });
    assertItemInWorldNear(loc, { type: Content.getMetaItemByName('Small Log').id, quantity: 2 });
  });

  it('plant a seed', () => {
    const toolIndex = 4;
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItem(loc, { type: Content.getMetaItemByName('Ploughed Ground').id, quantity: 1 });

    connection.send(ProtocolBuilder.use({
      toolIndex,
      loc,
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Mana Plant Seeded Ground').id, quantity: 1 });
    assertItemInContainer(container.id, toolIndex, {
      type: Content.getMetaItemByName('Mana Plant Seeds').id,
      quantity: 99,
    });
  });

  it('cook food', () => {
    const toolIndex = 0;
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItemInContainer(container.id, toolIndex, {
      type: Content.getMetaItemByName('Un-Cooked Large Ribs').id,
      quantity: 5,
    });
    setItemInContainer(container.id, toolIndex + 1, undefined);
    setItem(loc, { type: Content.getMetaItemByName('Large Camp Fire').id, quantity: 1 });

    connection.send(ProtocolBuilder.use({
      toolIndex,
      loc,
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Large Camp Fire').id, quantity: 1 });
    assertItemInContainer(container.id, toolIndex, {
      type: Content.getMetaItemByName('Un-Cooked Large Ribs').id,
      quantity: 4,
    });
    // Cooked ribs should be placed in the container.
    assertItemInContainer(container.id, toolIndex + 1, {
      type: Content.getMetaItemByName('Cooked Large Ribs').id,
      quantity: 1,
    });
  });

  it('closing/opening chest retains container id', () => {
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItem(loc, { type: Content.getMetaItemByName('Open Wooden Box').id, quantity: 1, containerId: 123 });

    connection.send(ProtocolBuilder.use({
      toolIndex: -1,
      loc,
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Wooden Box').id, quantity: 1, containerId: 123 });

    connection.send(ProtocolBuilder.use({
      toolIndex: -1,
      loc,
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Open Wooden Box').id, quantity: 1, containerId: 123 });
  });
});
