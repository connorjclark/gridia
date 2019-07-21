// tslint:disable: no-shadowed-variable

import Client from './client/client';
import { MINE } from './constants';
import Container from './container';
import * as Content from './content';
import Player from './player';
import { equalPoints } from './utils';

// ClientToServerProtocolFn
type C2S<T> = (server: import('./server/server').default, data: T) => void;

type AdminSetFloorParams = TilePoint & { floor: number };
const adminSetFloor: C2S<AdminSetFloorParams> = (server, { floor, ...loc }) => {
  if (!server.currentClientConnection.player.isAdmin) return;

  if (!server.context.map.inBounds(loc)) {
    return false;
  }

  server.setFloor(loc, floor);
};

type AdminSetItemParams = TilePoint & {item?: Item};
const adminSetItem: C2S<AdminSetItemParams> = (server, {item, ...loc}) => {
  if (!server.currentClientConnection.player.isAdmin) return;

  if (!server.context.map.inBounds(loc)) {
    return false;
  }

  server.setItem(loc, item);
};

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

  let toItem = getItem(toSource, to);

  // if (!server.inView(from) || !server.inView(to)) {
  //   return false
  // }

  if (!fromItem) return false;
  if (toItem && Content.getMetaItem(toItem.type).class === 'Container') {
    // Dragging to a container.
    toSource = server.context.getContainerIdFromItem(toItem);
    to = null;
    toItem = null;
  }
  if (toItem && fromItem.type !== toItem.type) return false;

  if (!Content.getMetaItem(fromItem.type).moveable) {
    return false;
  }

  // Prevent container-ception.
  if (Content.getMetaItem(fromItem.type).class === 'Container' && toSource === fromItem.containerId) {
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
    const playerHasPick = container.hasItem(Content.getMetaItemByName('Pick').id);
    if (!playerHasPick) return false;

    server.context.map.getTile(pos).floor = 19;
    server.broadcast('setFloor', {
      ...pos,
      floor: 19,
    });
    server.addItemNear(pos, {type: Content.getRandomMetaItemOfClass('Ore').id, quantity: 1});
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

interface RegisterParams { name: string; }
const register: C2S<RegisterParams> = (server, { name }) => {
  if (server.currentClientConnection.player) return;

  server.registerPlayer(server.currentClientConnection, {
    player: Object.assign(new Player(), {
      isAdmin: true,
      name,
    }),
  });
};

interface RequestContainerParams { containerId?: number; loc?: TilePoint; }
const requestContainer: C2S<RequestContainerParams> = (server, { containerId, loc }) => {
  if (!containerId && !loc) throw new Error('expected containerId or loc');

  if (!containerId) {
    const item = server.context.map.getItem(loc);
    containerId = server.context.getContainerIdFromItem(item);
  }

  const isClose = true; // TODO
  if (!isClose) {
    return false;
  }

  server.currentClientConnection.registeredContainers.push(containerId);
  server.reply('container', server.context.getContainer(containerId));
};

interface CloseContainerParams { containerId: number; }
const closeContainer: C2S<CloseContainerParams> = (server, { containerId }) => {
  const index = server.currentClientConnection.registeredContainers.indexOf(containerId);
  if (index !== -1) {
    server.currentClientConnection.registeredContainers.splice(index, 1);
  }
};

interface RequestCreatureParams { id: number; }
const requestCreature: C2S<RequestCreatureParams> = (server, {id}) => {
  server.reply('setCreature', {
    partial: false,
    ...server.context.getCreature(id),
  });
};

interface RequestPartitionParams { w: number; }
const requestPartition: C2S<RequestPartitionParams> = (server, {w}) => {
  const partition = server.context.map.getPartition(w);
  server.reply('initializePartition', {
    w,
    x: partition.width,
    y: partition.height,
    z: partition.depth,
  });
};

type RequestSectorParams = TilePoint;
const requestSector: C2S<RequestSectorParams> = (server, loc) => {
  const isClose = true; // TODO
  if (loc.x < 0 || loc.y < 0 || loc.z < 0 || !isClose) {
    return false;
  }

  server.reply('sector', {
    ...loc,
    tiles: server.context.map.getSector(loc),
  });
};

interface TameParams { creatureId: number; }
const tame: C2S<TameParams> = (server, { creatureId }) => {
  const creature = server.context.getCreature(creatureId);
  const isClose = true; // TODO
  if (!isClose) {
    return false;
  }

  if (creature.isPlayer) return;
  if (creature.tamedBy) return;

  creature.tamedBy = server.currentClientConnection.player.id;
  server.broadcastPartialCreatureUpdate(creature, ['tamedBy']);
};

interface UseParams { toolIndex: number; loc: TilePoint; usageIndex?: number; }
const use: C2S<UseParams> = (server, { toolIndex, loc, usageIndex = 0 }) => {
  if (!server.context.map.inBounds(loc)) {
    return false;
  }

  const inventory = server.currentClientConnection.container;
  // If -1, use an item that represents "Hand".
  const tool = toolIndex === -1 ? { type: 0, quantity: 0 } : inventory.items[toolIndex];
  // Got a request to use nothing as a tool - doesn't make sense to do that.
  if (!tool) return;

  const focus = server.context.map.getItem(loc) || { type: 0, quantity: 0 };

  const uses = Content.getItemUses(tool.type, focus.type);
  if (!uses.length) return;
  const use = uses[usageIndex];

  const usageResult = {
    tool: new Content.ItemWrapper(tool.type, tool.quantity).remove(use.toolQuantityConsumed || 0).raw(),
    focus: new Content.ItemWrapper(focus.type, focus.quantity).remove(use.focusQuantityConsumed || 0).raw(),
    successTool: use.successTool !== undefined ? new Content.ItemWrapper(use.successTool, 1).raw() : null,
    products: use.products.map((product) => ({...product})) as Item[],
  };
  if (focus.containerId && usageResult.products.length) {
    usageResult.products[0].containerId = focus.containerId;
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

  if (use.skill && use.skillSuccessXp) {
    const skill = Content.getSkills().find((skill) => skill.name === use.skill);
    if (skill) server.grantXp(server.currentClientConnection, skill.id, use.skillSuccessXp);
  }
};

export const ClientToServerProtocol = {
  adminSetFloor,
  adminSetItem,
  closeContainer,
  move,
  moveItem,
  register,
  requestContainer,
  requestCreature,
  requestPartition,
  requestSector,
  tame,
  use,
};

// ServerToClientProtocolFn
type S2C<T> = (client: Client, data: T) => void;

interface InitializeParams {
  isAdmin: boolean;
  creatureId: number;
  containerId: number;
  skills: Array<[number, number]>;
}
const initialize: S2C<InitializeParams> = (client, { isAdmin, creatureId, containerId, skills }) => {
  client.isAdmin = isAdmin;
  client.creatureId = creatureId;
  client.containerId = containerId;
  for (const [skillId, xp] of skills) {
    client.skills.set(skillId, xp);
  }
};

type InitializePartitionParams = TilePoint;
const initializePartition: S2C<InitializePartitionParams> = (client, pos) => {
  client.context.map.initPartition(pos.w, pos.x, pos.y, pos.z);
};

type SectorParams = TilePoint & { tiles: Sector };
const sector: S2C<SectorParams> = (client, { tiles, ...pos }) => {
  client.context.map.getPartition(pos.w).sectors[pos.x][pos.y][pos.z] = tiles;

  for (const row of tiles) {
    for (const tile of row) {
      if (tile.creature) {
        // Do not re-register creature.
        // TODO: Remove this line creates an issue when player warps to a different sector.
        if (client.context.getCreature(tile.creature.id)) continue;

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
const setFloor: S2C<SetFloorParams> = (client, { floor, ...loc }) => {
  client.context.map.getTile(loc).floor = floor;
};

type SetItemParams = TilePoint & { source: number, item?: Item };
const setItem: S2C<SetItemParams> = (client, { source, item, ...loc }) => {
  if (source === ItemSourceWorld) {
    client.context.map.getTile(loc).item = item;
  } else {
    const container = client.context.containers.get(source);
    if (container) {
      container.items[loc.x] = item;
    }
  }
};

// TODO write test ensuring the creature object stays the same (same reference).
type SetCreatureParams = {partial: boolean} & Partial<Creature>;
const setCreature: S2C<SetCreatureParams> = (client, {partial, ...partialCreature}) => {
  const id = partialCreature.id;

  const creature = client.context.getCreature(id);
  if (!creature) {
    if (partial) {
      client.wire.send('requestCreature', {id});
    } else {
      // @ts-ignore - it's not a partial creature.
      client.context.setCreature(partialCreature);
    }
    return;
  }

  const positionChanged = partialCreature.pos && !equalPoints(creature.pos, partialCreature.pos);
  if (positionChanged) {
    delete client.context.map.getTile(creature.pos).creature;
    client.context.map.getTile(partialCreature.pos).creature = creature;
  }
  Object.assign(creature, partialCreature);
};

type AnimationParams = TilePoint & { key: string };
const animation: S2C<AnimationParams> = (client, { x, y, z, key }) => {
  const animationData = Content.getAnimation(key);
  if (!animationData) throw new Error('no animation found: ' + key);
  for (const frame of animationData.frames) {
    if (frame.sound && client.PIXISound.exists(frame.sound)) {
      client.PIXISound.play(frame.sound, {volume: client.settings.volume});
    }
  }
};

// tslint:disable-next-line: interface-over-type-literal
type LogParams = { msg: string };
const log: S2C<LogParams> = (client, { msg }) => {
  console.log(msg);
};

// tslint:disable-next-line: interface-over-type-literal
type XpParams = { skill: number; xp: number };
const xp: S2C<XpParams> = (client, { skill, xp }) => {
  const currentXp = client.skills.get(skill) || 0;
  client.skills.set(skill, currentXp + xp);
};

export const ServerToClientProtocol = {
  initialize,
  initializePartition,
  sector,
  container,
  setFloor,
  setItem,
  setCreature,
  animation,
  log,
  xp,
};
