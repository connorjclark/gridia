// tslint:disable: no-shadowed-variable

import Client from './client/client';
import { MINE } from './constants';
import Container from './container';
import { getAnimation, getItemUses, getMetaItem,
  getMetaItemByName, getRandomMetaItemOfClass, ItemWrapper } from './items';
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
interface MoveItemParams { fromSource: number; from: TilePoint; toSource: number; to?: TilePoint; }
const moveItem: C2S<MoveItemParams> = (server, { from, fromSource, to, toSource }) => {
  function boundsCheck(source: number, loc?: TilePoint) {
    if (source === ItemSourceWorld) {
      if (!loc) throw new Error('invariant violated');
      return server.context.map.inBounds(loc);
    } else {
      // No location specified, so no way it could be out of bounds.
      if (!loc) return true;

      const container = server.context.getContainer(source);
      if (!container) return false;
      return loc.x < container.items.length;
    }
  }

  function getItem(source: number, loc?: TilePoint) {
    if (!loc) return;
    if (source === ItemSourceWorld) {
      return server.context.map.getItem(loc);
    } else {
      return server.context.getContainer(source).items[loc.x];
    }
  }

  function setItem(source: number, loc?: TilePoint, item?: Item) {
    if (source === ItemSourceWorld) {
      if (!loc) throw new Error('invariant violated');
      server.setItem(loc, item);
    } else {
      server.addItemToContainer(source, loc ? loc.x : undefined, item);
    }
  }

  if (!boundsCheck(fromSource, from) || !boundsCheck(toSource, to)) {
    return false;
  }

  // Ignore if moving to same location.
  if (fromSource === toSource && equalPoints(from, to)) {
    return false;
  }

  const fromItem = getItem(fromSource, from);
  const toItem = getItem(toSource, to);

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

  setItem(fromSource, from, undefined);
  setItem(toSource, to, fromItem);

  // TODO queue changes and send to all clients.
  // context.queueTileChange(from)
  // context.queueTileChange(to)
};

type MoveParams = TilePoint;
const move: C2S<MoveParams> = (server, pos) => {
  if (!server.context.map.inBounds(pos)) {
    return false;
  }

  if (!server.context.map.walkable(pos)) return false;

  if (server.context.map.getTile(pos).floor === MINE) {
    const container = server.currentClientConnection.container;
    const playerHasPick = container.hasItem(getMetaItemByName('Pick').id);
    if (!playerHasPick) return false;

    server.context.map.getTile(pos).floor = 19;
    server.broadcast('setFloor', {
      ...pos,
      floor: 19,
    });
    server.addItemNear(pos, {type: getRandomMetaItemOfClass('Ore').id, quantity: 1});
    server.broadcast('animation', {
      ...pos,
      key: 'MiningSound',
    });
  }

  // if (!server.inView(pos)) {
  //   return false
  // }

  const creature = server.currentClientConnection.player.creature;
  server.moveCreature(creature, pos);
};

interface RequestContainerParams { containerId: number; }
const requestContainer: C2S<RequestContainerParams> = (server, { containerId }) => {
  const isClose = true; // TODO
  if (!isClose) {
    return false;
  }

  server.currentClientConnection.registeredContainers.push(containerId);
  server.reply('container', server.context.getContainer(containerId));
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
    tiles: server.context.map.getSector({ x, y, z }),
  });
};

interface UseParams { toolIndex: number; loc: TilePoint; }
const use: C2S<UseParams> = (server, { toolIndex, loc }) => {
  if (!server.context.map.inBounds(loc)) {
    return false;
  }

  const inventory = server.currentClientConnection.container;
  // If -1, use an item that represents "Hand".
  const tool = toolIndex === -1 ? { type: 0, quantity: 0 } : inventory.items[toolIndex];
  // Got a request to use nothing as a tool - doesn't make sense to do that.
  if (!tool) return;

  const focus = server.context.map.getItem(loc) || { type: 0, quantity: 0 };

  const uses = getItemUses(tool.type, focus.type);
  if (!uses.length) return;
  const use = uses[0];

  const toolQuantityConsumed = use.toolQuantityConsumed === undefined ? 1 : use.toolQuantityConsumed;
  const usageResult = {
    tool: new ItemWrapper(tool.type, tool.quantity).remove(toolQuantityConsumed).raw(),
    focus: new ItemWrapper(focus.type, focus.quantity).remove(use.focusQuantityConsumed).raw(),
    successTool: use.successTool !== undefined ? new ItemWrapper(use.successTool, 1).raw() : null,
    products: [] as Item[],
  };
  for (let i = 0; i < use.products.length; i++) {
    usageResult.products.push({
      type: use.products[i],
      quantity: use.quantities[i],
    });
  }

  if (usageResult.successTool) {
    server.addItemToContainer(inventory.id, undefined, usageResult.successTool);
  }

  server.setItemInContainer(inventory.id, toolIndex, usageResult.tool);
  server.context.map.getTile(loc).item = usageResult.focus;
  server.broadcast('setItem', {
    ...loc,
    source: 0,
    item: usageResult.focus,
  });
  for (const product of usageResult.products) {
    server.addItemNear(loc, product);
  }

  if (use.animation) {
    server.broadcast('animation', {
      ...loc,
      key: use.animation,
    });
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

interface InitializeParams { creatureId: number; containerId: number; width: number; height: number; depth: number; }
const initialize: S2C<InitializeParams> = (client, { creatureId, containerId, width, height, depth }) => {
  client.context.map.init(width, height, depth);
  client.creatureId = creatureId;
  client.containerId = containerId;
};

type SectorParams = TilePoint & { tiles: Sector };
const sector: S2C<SectorParams> = (client, { x, y, z, tiles }) => {
  client.context.map.sectors[x][y][z] = tiles;

  for (const row of tiles) {
    for (const tile of row) {
      if (tile.creature) {
        client.context.setCreature(tile.creature);
      }
    }
  }
};

type ContainerParams = Container;
const container: S2C<ContainerParams> = (client, container) => {
  client.context.containers.set(container.id, container);
};

type SetFloorParams = TilePoint & { floor: number };
const setFloor: S2C<SetFloorParams> = (client, { x, y, z, floor }) => {
  client.context.map.getTile({ x, y, z }).floor = floor;
};

type SetItemParams = TilePoint & { source: number, item?: Item };
const setItem: S2C<SetItemParams> = (client, { x, y, z, source, item }) => {
  if (source === ItemSourceWorld) {
    client.context.map.getTile({ x, y, z }).item = item;
  } else {
    const container = client.context.containers.get(source);
    if (container) {
      container.items[x] = item;
    }
  }
};

// TODO optimize for partial updates. For now, every change (including movement)
// includes all data for the creature.
// type SetCreatureParams = Partial<Creature>;
type SetCreatureParams = Creature;
const setCreature: S2C<SetCreatureParams> = (client, creatureUpdate) => {
  const creature = client.context.getCreature(creatureUpdate.id);
  if (!creature) {
    client.context.setCreature(creatureUpdate);
    return;
  }

  const previousPos = creature.pos;

  if (creatureUpdate.pos && !equalPoints(previousPos, creatureUpdate.pos)) {
    delete client.context.map.getTile(previousPos).creature;
    client.context.setCreature(creatureUpdate);
  }

  // WIP partial update needs work.
  // const id = creatureUpdate.id;
  // const creature = client.context.getCreature(id);

  // if (!creature) {
  //   // @ts-ignore
  //   client.context.setCreature(creatureUpdate);
  //   return;
  // }

  // const prevPos = creature.pos;

  // // Move.
  // if (creatureUpdate.pos && !equalPoints(prevPos, creatureUpdate.pos)) {
  //   client.context.map.getTile(prevPos).creature = null;
  //   client.context.map.getTile(creatureUpdate.pos).creature = creature;
  // }

  // Object.assign(creature, creatureUpdate);
};

type AnimationParams = TilePoint & { key: string };
const animation: S2C<AnimationParams> = (client, { x, y, z, key }) => {
  const animationData = getAnimation(key);
  if (!animationData) throw new Error('no animation found: ' + key);
  for (const frame of animationData.frames) {
    if (frame.sound && client.PIXISound.exists(frame.sound)) client.PIXISound.play(frame.sound);
  }
};

// tslint:disable-next-line: interface-over-type-literal
type LogParams = { msg: string };
const log: S2C<LogParams> = (client, { msg }) => {
  console.log(msg);
};

export const ServerToClientProtocol = {
  initialize,
  sector,
  container,
  setFloor,
  setItem,
  setCreature,
  animation,
  log,
};
