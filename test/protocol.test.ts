/// <reference path="../src/types.d.ts" />

import Server, { openAndConnectToServerInMemory } from '../src/server';
import Client from '../src/client';
import * as assert from 'assert';
import { getMetaItem, getMetaItemByName } from '../src/items';

let client: Client;
let server: Server;
let wire: ClientToServerWire;

beforeEach(() => {
  client = new Client();
  let serverAndWire = openAndConnectToServerInMemory(client);
  wire = serverAndWire.clientToServerWire;
  server = serverAndWire.server;
});

describe('moveItem', () => {
  assert(getMetaItem(1).stackable);
  assert(getMetaItem(1).moveable);

  it('move item', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };

    server.world.getTile(from).item = { type: 1, quantity: 10 };

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    assert.equal(null, server.world.getItem(from));
    expect(server.world.getItem(to)).toEqual({ type: 1, quantity: 10 });
  });

  it('fail to move item to nonempty tile', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };

    server.world.getTile(from).item = { type: 1, quantity: 1 };
    server.world.getTile(to).item = { type: 2, quantity: 1 };

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    expect(server.world.getItem(from)).toEqual({ type: 1, quantity: 1 });
    expect(server.world.getItem(to)).toEqual({ type: 2, quantity: 1 });
  });

  it('move stackable item', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };
    const gold = getMetaItemByName('Gold');

    server.world.getTile(from).item = { type: gold.id, quantity: 1 };
    server.world.getTile(to).item = { type: gold.id, quantity: 2 };

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    assert.equal(null, server.world.getItem(from));
    expect(server.world.getItem(to)).toEqual({ type: gold.id, quantity: 3 });
  });

  it('move item from world to container', () => {
    const from = { x: 0, y: 0 };

    server.world.getTile(from).item = { type: 1, quantity: 1 };
    const container = server.makeContainer();

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: { x: 0, y: 0 },
      toSource: container.id,
    });

    server.consumeAllMessages();

    assert.equal(null, server.world.getItem(from));
    expect(container.items[0]).toEqual({ type: 1, quantity: 1 });
  });

  it('move item from world to container: null places in first open slot', () => {
    const from = { x: 0, y: 0 };

    server.world.getTile(from).item = { type: 1, quantity: 1 };
    const container = server.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[3] = { type: 2, quantity: 1 };

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: null,
      toSource: container.id,
    });

    server.consumeAllMessages();

    assert.equal(null, server.world.getItem(from));
    expect(container.items[2]).toEqual({ type: 1, quantity: 1 });
  });

  it('move item from world to container: null places in first open slot - stacks', () => {
    const from = { x: 0, y: 0 };

    server.world.getTile(from).item = { type: 1, quantity: 1 };
    const container = server.makeContainer();
    container.items[0] = { type: 2, quantity: 1 };
    container.items[1] = { type: 2, quantity: 1 };
    container.items[2] = { type: 1, quantity: 2 };
    container.items[3] = { type: 2, quantity: 1 };

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to: null,
      toSource: container.id,
    });

    server.consumeAllMessages();

    assert.equal(null, server.world.getItem(from));
    expect(container.items[2]).toEqual({ type: 1, quantity: 3 });
  });
});
