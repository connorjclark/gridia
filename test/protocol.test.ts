/// <reference path="../src/types.d.ts" />

import Server, { openAndConnectToServerInMemory } from '../src/server';
import Client from '../src/client';
import * as assert from 'assert';
import { getMetaItemByName } from '../src/items';

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
});
