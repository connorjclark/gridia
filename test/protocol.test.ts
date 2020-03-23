// tslint:disable-next-line: no-reference
/// <reference path="../src/types.d.ts" />

// TODO: add test/ to tsconfig

jest.mock('pixi-sound', () => ({}));

import * as assert from 'assert';
import Client from '../src/client/client';
import { Connection } from '../src/client/connection';
import { MINE } from '../src/constants';
import * as Content from '../src/content';
import { makeBareMap } from '../src/mapgen';
import * as ProtocolBuilder from '../src/protocol/client-to-server-protocol-builder';
import Server from '../src/server/server';
import { ServerContext } from '../src/server/server-context';
import * as Utils from '../src/utils';
import WorldMap from '../src/world-map';
import { openAndConnectToServerInMemory } from './server-in-memory';

let client: Client;
let server: Server;
let connection: Connection;

// TODO would be cool to see these tests while rendering the game.

// Immediately process messages.
async function send(message) {
  connection.send(message);
  await server.consumeAllMessages();
}

beforeEach(async () => {
  const worldMap = new WorldMap();
  const partition = makeBareMap(20, 20, 1);
  worldMap.addPartition(0, partition);
  partition.loader = async () => partition.createEmptySector(); // :(
  const memoryServerData = await openAndConnectToServerInMemory({
    serverData: '/', // ?
    dummyDelay: 0,
    verbose: false,
    serverContext: new ServerContext(worldMap, ''),
  });
  client = memoryServerData.client;
  connection = client.connection;
  server = memoryServerData.server;

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
  server.context.containers.get(id).items[index] = clone(item);
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
  const point = server.findNearest(location, 10, true, (tile) => Utils.equalItems(tile.item, item));
  assert(point);
  expect(client.context.map.getItem(point)).toEqual(item);
}

function assertItemInContainer(containerId: number, index: number, item: Item) {
  expect(server.context.containers.get(containerId).items[index]).toEqual(item);
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

  it('player can move to open space', async () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};

    assertCreatureAt(from, creature.id);
    await send(ProtocolBuilder.move(to));
    assertCreatureAt(to, creature.id);
  });

  it('player can move to walkable item', async () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};
    setItem(to, { type: 1, quantity: Content.getMetaItemByName('Cut Red Rose').id });

    assertCreatureAt(from, creature.id);
    await send(ProtocolBuilder.move(to));
    assertCreatureAt(to, creature.id);
  });

  it('player can not move to unwalkable item', async () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};
    setItem(to, { type: Content.getMetaItemByName('Granite Wall').id, quantity: 1 });

    assertCreatureAt(from, creature.id);
    await send(ProtocolBuilder.move(to));
    assertCreatureAt(from, creature.id);
  });

  // TODO broadcast new creatures.
  // it('player can not move where other creature is', () => {
  //   const from = {x: 5, y: 5, z: 0};
  //   const to = {x: 6, y: 5, z: 0};
  //   const otherCreature = server.makeCreature(to);
  //   assertCreatureAt(to, otherCreature.id);

  //   assertCreatureAt(from, creature.id);
  //   send(ProtocolBuilder.move(to));
  //   assertCreatureAt(from, creature.id);
  // });

  // TODO refactor "server.makeCreature" to not give items.
  // it('player can not move to mine wall without pickaxe in inventory', () => {
  //   const from = {x: 5, y: 5, z: 0};
  //   const to = {x: 6, y: 5, z: 0};
  //   setFloor(to, MINE);

  //   assertCreatureAt(from, creature.id);
  //   send(ProtocolBuilder.move(to));
  //   assertCreatureAt(from, creature.id);
  // });

  it('player can move to mine wall with pickaxe in inventory', async () => {
    const from = {w: 0, x: 5, y: 5, z: 0};
    const to = {w: 0, x: 6, y: 5, z: 0};
    setFloor(to, MINE);

    assertCreatureAt(from, creature.id);
    await send(ProtocolBuilder.move(to));
    assertCreatureAt(to, creature.id);
  });
});

describe('moveItem', () => {
  assert(Content.getMetaItem(1).stackable);
  assert(Content.getMetaItem(1).moveable);

  it('move item', async () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };
    const to = { w: 0, x: 1, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 10 });

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.World(from),
      to: Utils.ItemLocation.World(to),
    }));

    assertItemInWorld(from, undefined);
    assertItemInWorld(to, { type: 1, quantity: 10 });
  });

  it('fail to move item to non-empty tile', async () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };
    const to = { w: 0, x: 1, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    setItem(to, { type: 2, quantity: 1 });

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.World(from),
      to: Utils.ItemLocation.World(to),
    }));

    assertItemInWorld(from, { type: 1, quantity: 1 });
    assertItemInWorld(to, { type: 2, quantity: 1 });
  });

  it('move stackable item', async () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };
    const to = { w: 0, x: 1, y: 0, z: 0 };
    const gold = Content.getMetaItemByName('Gold');

    setItem(from, { type: gold.id, quantity: 1 });
    setItem(to, { type: gold.id, quantity: 2 });

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.World(from),
      to: Utils.ItemLocation.World(to),
    }));

    assertItemInWorld(from, undefined);
    assertItemInWorld(to, { type: gold.id, quantity: 3 });
  });

  it('move item from container to world', async () => {
    const to = { w: 0, x: 0, y: 0, z: 0 };

    const container = server.context.makeContainer();
    container.items[0] = { type: 1, quantity: 1 };
    await send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.Container(container.id, 0),
      to: Utils.ItemLocation.World(to),
    }));

    assertItemInWorld(to, { type: 1, quantity: 1 });
    assertItemInContainer(container.id, 0, null);
  });

  it('move item from world to container', async () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.context.makeContainer();
    await send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.World(from),
      to: Utils.ItemLocation.Container(container.id, 0),
    }));

    assertItemInWorld(from, undefined);
    assertItemInContainer(container.id, 0, { type: 1, quantity: 1 });
  });

  it('move item from world to container: no "index" places in first open slot', async () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.context.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[3] = { type: 2, quantity: 1 };
    await send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.World(from),
      to: Utils.ItemLocation.Container(container.id),
    }));

    assertItemInWorld(from, undefined);
    assertItemInContainer(container.id, 2, { type: 1, quantity: 1 });
  });

  it('move item from world to container: no "index" places in first open slot - stacks', async () => {
    const from = { w: 0, x: 0, y: 0, z: 0 };

    setItem(from, { type: 1, quantity: 1 });
    const container = server.context.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[2] = { type: 1, quantity: 2 };
    container.items[3] = { type: 2, quantity: 1 };
    await send(ProtocolBuilder.requestContainer({ containerId: container.id }));

    await send(ProtocolBuilder.moveItem({
      from: Utils.ItemLocation.World(from),
      to: Utils.ItemLocation.Container(container.id),
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

  it('cut down tree', async () => {
    const toolIndex = 0;
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItem(loc, { type: Content.getMetaItemByName('Pine Tree').id, quantity: 1 });

    await send(ProtocolBuilder.use({
      toolIndex,
      location: Utils.ItemLocation.World(loc),
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Pine Tree Stump').id, quantity: 1 });
    assertItemInWorldNear(loc, { type: Content.getMetaItemByName('Small Branches').id, quantity: 6 });
    assertItemInWorldNear(loc, { type: Content.getMetaItemByName('Small Log').id, quantity: 2 });
  });

  it('plant a seed', async () => {
    const toolIndex = 4;
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItem(loc, { type: Content.getMetaItemByName('Ploughed Ground').id, quantity: 1 });

    await send(ProtocolBuilder.use({
      toolIndex,
      location: Utils.ItemLocation.World(loc),
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Mana Plant Seeded Ground').id, quantity: 1 });
    assertItemInContainer(container.id, toolIndex, {
      type: Content.getMetaItemByName('Mana Plant Seeds').id,
      quantity: 99,
    });
  });

  it('cook food', async () => {
    const toolIndex = 0;
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItemInContainer(container.id, toolIndex, {
      type: Content.getMetaItemByName('Un-Cooked Large Ribs').id,
      quantity: 5,
    });
    setItemInContainer(container.id, toolIndex + 1, undefined);
    setItem(loc, { type: Content.getMetaItemByName('Large Camp Fire').id, quantity: 1 });

    await send(ProtocolBuilder.use({
      toolIndex,
      location: Utils.ItemLocation.World(loc),
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

  it('closing/opening chest retains container id', async () => {
    const loc = { w: 0, x: 0, y: 0, z: 0 };

    setItem(loc, { type: Content.getMetaItemByName('Open Wooden Box').id, quantity: 1, containerId: 123 });

    await send(ProtocolBuilder.use({
      toolIndex: -1,
      location: Utils.ItemLocation.World(loc),
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Wooden Box').id, quantity: 1, containerId: 123 });

    await send(ProtocolBuilder.use({
      toolIndex: -1,
      location: Utils.ItemLocation.World(loc),
    }));

    assertItemInWorld(loc, { type: Content.getMetaItemByName('Open Wooden Box').id, quantity: 1, containerId: 123 });
  });
});
