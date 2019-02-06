import { getMetaItem } from './items'
import Server from './server'
import { Client } from "./main";

// ClientToServerProtocolFn
type C2S<T> = (server: Server, data: T) => void;

type MoveItemParams = { from: Point, to: Point };
const moveItem: C2S<MoveItemParams> = (server, { from, to }) => {
  if (!server.world.inBounds(from) || !server.world.inBounds(to)) {
    return false
  }

  // if (!server.inView(from) || !server.inView(to)) {
  //   return false
  // }

  const fromTile = server.world.getTile(from)
  const toTile = server.world.getTile(to)

  if (fromTile === toTile) {
    return false
  }

  if (!fromTile.item) return false;
  if (toTile.item && fromTile.item.type !== toTile.item.type) return false;

  if (!getMetaItem(fromTile.item.type).moveable) {
    return false
  }

  if (toTile.item && toTile.item.type === fromTile.item.type) {
    fromTile.item.quantity += 1
  }
  toTile.item = fromTile.item
  fromTile.item = null

  // context.queueTileChange(from)
  // context.queueTileChange(to)
}

type MoveParams = Point;
const move: C2S<MoveParams> = (server, pos) => {
  if (!server.world.inBounds(pos)) {
    return false
  }

  // if (!server.inView(pos)) {
  //   return false
  // }

  const creature = server.currentClientConnection.creature;

  server.world.getTile(creature.pos).creature = null;
  creature.pos = pos;
  server.world.getTile(creature.pos).creature = creature;

  // TODO reply all
  server.reply('setCreature', {
    id: creature.id,
    pos: creature.pos
  });
}

const requested = new Map<string, boolean>()
type RequestSectorParams = Point;
const requestSector: C2S<RequestSectorParams> = (server, { x, y }) => {
  if (requested.get(x + ',' + y)) {
    return false
  }
  requested.set(x + ',' + y, true)

  const isClose = true // TODO
  if (x < 0 || y < 0 || !isClose) {
    return false;
  }

  server.reply('sector', {
    x,
    y,
    tiles: server.world.getSector({ x, y }),
  })
}

export const ClientToServerProtocol = {
  moveItem,
  requestSector,
  move,
}

// ServerToClientProtocolFn
type S2C<T> = (client: Client, data: T) => void;

type InitializeParams = { creatureId: number };
const initialize: S2C<InitializeParams> = (client, { creatureId }) => {
  client.creatureId = creatureId;
}

type SectorParams = Point & { tiles: Sector };
const sector: S2C<SectorParams> = (client, { x, y, tiles }) => {
  client.world.sectors[x][y] = tiles
}

type SetItemParams = Point & { item: Item };
const setItem: S2C<SetItemParams> = (client, { x, y, item }) => {
  client.world.getTile({ x, y }).item = item
}

// TODO make all but id optional
type SetCreatureParams = Partial<Creature>;
const setCreature: S2C<SetCreatureParams> = (client, { pos, id, image }) => {
  let creature = client.world.getCreature(id);

  if (!creature) {
    if (id) {
      client.world.setCreature(creature = {
        id,
        image,
        pos,
      });
    } else {
      // TODO get from server
      client.world.setCreature(creature = {
        id,
        image,
        pos,
      });
    }
  }

  client.world.getTile(creature.pos).creature = null;
  creature.pos = pos;
  client.world.getTile(creature.pos).creature = creature;
}

export const ServerToClientProtocol = {
  initialize,
  sector,
  setItem,
  setCreature,
}
