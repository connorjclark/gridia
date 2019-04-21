/// <reference path="../src/types.d.ts" />

import Server, { openAndConnectToServerInMemory } from '../src/server';
import Client from '../src/client';
import * as assert from 'assert';

let client: Client;
let server: Server;
let wire: ClientToServerWire;

beforeAll(() => {
  client = new Client();
  let serverAndWire = openAndConnectToServerInMemory(client);
  wire = serverAndWire.clientToServerWire;
  server = serverAndWire.server;
});

describe('use', () => {
  it('moveItem', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };

    server.world.getTile(from).item = {
      type: 1,
      quantity: 10,
    };

    wire.send('moveItem', {
      from,
      fromSource: 0,
      to,
      toSource: 0,
    });

    server.consumeAllMessages();

    assert.equal(1, server.world.getItem(to).type);
    assert.equal(10, server.world.getItem(to).quantity);
  });
});
