import Client from './client/client';
import { MINE } from './constants';
import { getItemUses, getMetaItem, getMetaItemByName, getRandomMetaItemOfClass, ItemWrapper } from './items';
import Server from './server/server';
import { equalPoints } from './utils';

// ClientToServerProtocolFn
type C2S<T> = (server: Server, data: T) => void;

// moveItem handles movement between anywhere items can be - from the world to a player's
// container, within a container, from a container to the world, or even between containers.
// Note, containers have a fixed y value of 0. If "to" is null for a container, no location
// is specified and the item will be place in the first viable slot.
// TODO - better name than "source"? Maybe just generalize to "Container" where 0 refers to world?
export const ItemSourceWorld = 0;
interface MoveItemParams { from: TilePoint; fromSource: number; to: TilePoint; toSource: number; }
const moveItem: C2S<MoveItemParams> = (server, { from, fromSource, to, toSource }) => {
  function boundsCheck(loc: TilePoint | null, source: number) {
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

  function getItem(loc: TilePoint, source: number) {
    if (source === ItemSourceWorld) {
      return server.world.getItem(loc);
    } else {
      if (!loc) return;
      return server.getContainer(source).items[loc.x];
    }
  }

  function setItem(loc: TilePoint, source: number, item: Item) {
    if (source === ItemSourceWorld) {
      server.world.getTile(loc).item = item;
    } else {
      const container = server.getContainer(source);

      // If location is not specified, pick one:
      // Pick the first slot of the same item type, if stackable.
      // Else, pick the first open slot.
      if (!loc) {
        let firstOpenSlot = null;
        let firstStackableSlot = null;
        for (let i = 0; i < container.items.length; i++) {
          if (firstOpenSlot === null && !container.items[i]) {
            firstOpenSlot = i;
          }
          if (firstStackableSlot === null && container.items[i] && container.items[i].type === item.type) {
            firstStackableSlot = i;
            break;
          }
        }

        if (firstStackableSlot !== null) {
          loc = { x: firstStackableSlot, y: 0, z: 0 };
          item.quantity += container.items[firstStackableSlot].quantity;
        } else if (firstOpenSlot !== null) {
          loc = { x: firstOpenSlot, y: 0, z: 0 };
        }
      }

      if (loc) {
        container.items[loc.x] = item;
      } else {
        // TODO don't let containers grow unbounded.
        container.items.push(item);
      }
    }

    server.broadcast('setItem', {
      ...loc,
      source,
      item,
    });
  }

  if (!boundsCheck(from, fromSource) || !boundsCheck(to, toSource)) {
    return false;
  }

  // Ignore if moving to same location.
  if (fromSource === toSource && equalPoints(from, to)) {
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
    fromItem.quantity += toItem.quantity;
  }

  setItem(from, fromSource, null);
  setItem(to, toSource, fromItem);

  // TODO queue changes and send to all clients.
  // context.queueTileChange(from)
  // context.queueTileChange(to)
};

type MoveParams = TilePoint;
const move: C2S<MoveParams> = (server, pos) => {
  if (!server.world.inBounds(pos)) {
    return false;
  }

  if (!server.world.walkable(pos)) return false;

  if (server.world.getTile(pos).floor === MINE) {
    const containerId = server.currentClientConnection.creature.containerId;
    const playerHasPick = server.containerHasItem(containerId, getMetaItemByName('Pick').id);
    if (!playerHasPick) return false;

    server.world.getTile(pos).floor = 19;
    server.broadcast('setFloor', {
      ...pos,
      floor: 19,
    });
    server.addItemNear(pos, {type: getRandomMetaItemOfClass('Ore').id, quantity: 1});
    server.broadcast('sound', {
      ...pos,
      key: 'digi_plink',
    });
  }

  // if (!server.inView(pos)) {
  //   return false
  // }

  const creature = server.currentClientConnection.creature;
  server.moveCreature(creature, pos);
  server.currentClientConnection.warped = false;
};

interface RequestContainerParams { containerId: number; }
const requestContainer: C2S<RequestContainerParams> = (server, { containerId }) => {
  const isClose = true; // TODO
  if (!isClose) {
    return false;
  }

  server.reply('container', server.getContainer(containerId));
};

type RequestSectorParams = TilePoint;
const requestSector: C2S<RequestSectorParams> = (server, { x, y, z }) => {
  const isClose = true; // TODO
  if (x < 0 || y < 0 || z < 0 || !isClose) {
    return false;
  }

  server.reply('sector', {
    x,
    y,
    z,
    tiles: server.world.getSector({ x, y, z }),
  });
};

interface UseParams { toolIndex: number; loc: TilePoint; }
const use: C2S<UseParams> = (server, { toolIndex, loc }) => {
  if (!server.world.inBounds(loc)) {
    return false;
  }

  const creature = server.currentClientConnection.creature;
  const inventory = server.getContainer(creature.containerId);
  // If -1, use an item that represents "Hand".
  const tool = toolIndex === -1 ? { type: 0, quantity: 0 } : inventory.items[toolIndex];
  if (!tool) return;

  const focus = server.world.getItem(loc) || { type: 0, quantity: 0 };

  const uses = getItemUses(tool.type, focus.type);
  if (!uses.length) return;
  const use = uses[0];

  const usageResult = {
    tool: new ItemWrapper(tool.type, tool.quantity).remove(use.toolQuantityConsumed).raw(),
    focus: new ItemWrapper(focus.type, focus.quantity).remove(use.focusQuantityConsumed).raw(),
    products: [] as Item[],
  };
  for (let i = 0; i < use.products.length; i++) {
    usageResult.products.push({
      type: use.products[i],
      quantity: use.quantities[i],
    });
  }

  inventory.items[toolIndex] = usageResult.tool;
  server.world.getTile(loc).item = usageResult.focus;
  server.broadcast('setItem', {
    ...loc,
    source: 0,
    item: usageResult.focus,
  });
  for (const product of usageResult.products) {
    server.addItemNear(loc, product);
  }
};

export const ClientToServerProtocol = {
  move,
  moveItem,
  requestContainer,
  requestSector,
  use,
};

// ServerToClientProtocolFn
type S2C<T> = (client: Client, data: T) => void;

interface InitializeParams { creatureId: number; width: number; height: number; depth: number; }
const initialize: S2C<InitializeParams> = (client, { creatureId, width, height, depth }) => {
  client.world.init(width, height, depth);
  client.creatureId = creatureId;
};

type SectorParams = TilePoint & { tiles: Sector };
const sector: S2C<SectorParams> = (client, { x, y, z, tiles }) => {
  client.world.sectors[x][y][z] = tiles;
};

type ContainerParams = Container;
const container: S2C<ContainerParams> = (client, container) => {
  client.world.containers.set(container.id, container);
};

type SetFloorParams = TilePoint & { floor: number };
const setFloor: S2C<SetFloorParams> = (client, { x, y, z, floor }) => {
  client.world.getTile({ x, y, z }).floor = floor;
};

type SetItemParams = TilePoint & { source: number, item: Item };
const setItem: S2C<SetItemParams> = (client, { x, y, z, source, item }) => {
  if (source === ItemSourceWorld) {
    client.world.getTile({ x, y, z }).item = item;
  } else {
    const container = client.world.containers.get(source);
    if (container) {
      container.items[x] = item;
    }
  }
};

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
};

type SoundParams = TilePoint & { key: string };
const sound: S2C<SoundParams> = (client, { x, y, z, key }) => {
  client.PIXISound.play(key);
};

export const ServerToClientProtocol = {
  initialize,
  sector,
  container,
  setFloor,
  setItem,
  setCreature,
  sound,
};
