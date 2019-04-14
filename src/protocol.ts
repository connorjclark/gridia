import { getMetaItem } from './items'
import Server from './server'
import { Client } from "./main";

// ClientToServerProtocolFn
type C2S<T> = (server: Server, data: T) => void;

// moveItem handles movement between anywhere items can be - from the world to a player's
// container, within a container, from a container to the world, or even between containers.
// Note, containers have a fixed y value of 0. If "to" is null for a container, no location
// is specified and the item will be place in the first viable slot.
// TODO - better name than "source"? Maybe just generalize to "Container" where 0 refers to world?
export const ItemSourceWorld = 0;
type MoveItemParams = { from: Point, fromSource: number, to: Point, toSource: number };
const moveItem: C2S<MoveItemParams> = (server, { from, fromSource, to, toSource }) => {
  function boundsCheck(loc: Point | null, source: number) {
    if (source === ItemSourceWorld) {
      return server.world.inBounds(loc);
    } else {
      // No location specified.
      if (!loc) return true;

      const container = server.getContainer(source);
      if (!container) return false;
      return loc.x < container.items.length;
    }
  }

  function getItem(loc: Point, source: number) {
    if (source === ItemSourceWorld) {
      return server.world.getItem(loc);
    } else {
      if (!loc) return;
      return server.getContainer(source).items[loc.x];
    }
  }

  function setItem(loc: Point, source: number, item: Item) {
    if (source === ItemSourceWorld) {
      server.world.getTile(loc).item = item;
    } else {
      const container = server.getContainer(source);
      if (!loc) {
        for (let i = 0; i < container.items.length; i++) {
          if (!container.items[i]) {
            loc = {x: i, y: 0};
            break;
          }
        }
      }
      if (loc) {
        container.items[loc.x] = item;
      } else {
        container.items.push(item);
      }
    }
  }

  if (!boundsCheck(from, fromSource) || !boundsCheck(to, toSource)) {
    return false
  }

  // Ignore if moving to same location.
  if (from === to && fromSource === toSource) {
    return false;
  }

  const fromItem = getItem(from, fromSource);
  const toItem = getItem(to, toSource);

  // if (!server.inView(from) || !server.inView(to)) {
  //   return false
  // }

  if (!fromItem) return false;
  if (toItem && fromItem.type !== toItem.type) return false;

  if (!getMetaItem(fromItem.type).moveable) {
    return false;
  }

  if (toItem && toItem.type === fromItem.type) {
    fromItem.quantity += 1
  }
  
  setItem(from, fromSource, null);
  setItem(to, toSource, fromItem);

  // TODO queue changes and send to all clients.
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

type ContainerParams = Container;
const container: S2C<ContainerParams> = (client, container) => {
  client.world.containers.set(container.id, container);
}

type SetItemParams = Point & { source: number, item: Item };
const setItem: S2C<SetItemParams> = (client, { x, y, source, item }) => {
  if (source === ItemSourceWorld) {
    client.world.getTile({ x, y }).item = item
  } else {
    const container = client.world.containers.get(source);
    if (container) {
      container.items[x] = item;
    }
  }
}

// TODO make all but id optional
type SetCreatureParams = Partial<Creature>;
const setCreature: S2C<SetCreatureParams> = (client, { pos, id, containerId, image }) => {
  let creature = client.world.getCreature(id);

  if (!creature) {
    if (id) {
      client.world.setCreature(creature = {
        id,
        containerId,
        image,
        pos,
      });
    } else {
      // TODO get from server
      client.world.setCreature(creature = {
        id,
        containerId,
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
  container,
  setItem,
  setCreature,
}
