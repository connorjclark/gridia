import { MINE } from '../constants';
import * as Content from '../content';
import Player from '../player';
import Server from '../server/server';
import { equalPoints } from '../utils';
import * as Protocol from './gen/client-to-server-protocol';
import * as ProtocolBuilder from './server-to-client-protocol-builder';

export const ItemSourceWorld = 0;

export default class ClientToServerProtocol implements Protocol.ClientToServerProtocol {
  public onMove(server: Server, { ...loc }: Protocol.MoveParams): void {
    if (!server.context.map.inBounds(loc)) {
      return;
    }

    if (!server.context.map.walkable(loc)) return;

    if (server.context.map.getTile(loc).floor === MINE) {
      const container = server.currentClientConnection.container;
      const playerHasPick = container.hasItem(Content.getMetaItemByName('Pick').id);
      if (!playerHasPick) return;

      server.context.map.getTile(loc).floor = 19;
      server.broadcast(ProtocolBuilder.setFloor({
        ...loc,
        floor: 19,
      }));
      server.addItemNear(loc, {type: Content.getRandomMetaItemOfClass('Ore').id, quantity: 1});
      server.broadcast(ProtocolBuilder.animation({
        ...loc,
        key: 'MiningSound',
      }));
    }

    // if (!server.inView(loc)) {
    //   return false
    // }

    const creature = server.currentClientConnection.player.creature;
    server.moveCreature(creature, loc);
  }

  public onRegister(server: Server, { name }: Protocol.RegisterParams): void {
    if (server.currentClientConnection.player) return;
    if (name.length > 20) return;

    server.registerPlayer(server.currentClientConnection, {
      player: Object.assign(new Player(), {
        isAdmin: true,
        name,
      }),
    });
  }

  public async onRequestContainer(server: Server, { containerId, loc }: Protocol.RequestContainerParams) {
    if (!containerId && !loc) throw new Error('expected containerId or loc');
    if (containerId && loc) throw new Error('expected only one of containerId or loc');

    if (!containerId && loc) {
      const item = server.context.map.getItem(loc);
      if (item) containerId = server.context.getContainerIdFromItem(item);
    }

    const isClose = true; // TODO
    if (!isClose) {
      return;
    }

    if (!containerId) {
      throw new Error('could not find container');
    }

    server.currentClientConnection.registeredContainers.push(containerId);
    const container = await server.context.getContainer(containerId);
    server.reply(ProtocolBuilder.container(container));
  }

  public onCloseContainer(server: Server, { containerId }: Protocol.CloseContainerParams): void {
    const index = server.currentClientConnection.registeredContainers.indexOf(containerId);
    if (index !== -1) {
      server.currentClientConnection.registeredContainers.splice(index, 1);
    }
  }

  public onRequestCreature(server: Server, { id }: Protocol.RequestCreatureParams): void {
    server.reply(ProtocolBuilder.setCreature({
      partial: false,
      ...server.context.getCreature(id),
    }));
  }

  public onRequestPartition(server: Server, { w }: Protocol.RequestPartitionParams): void {
    const partition = server.context.map.getPartition(w);
    server.reply(ProtocolBuilder.initializePartition({
      w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));
  }

  public async onRequestSector(server: Server, { ...loc }: Protocol.RequestSectorParams) {
    const isClose = true; // TODO
    if (loc.x < 0 || loc.y < 0 || loc.z < 0 || !isClose) {
      return;
    }

    const tiles = await server.ensureSectorLoaded(loc);

    server.reply(ProtocolBuilder.sector({
      ...loc,
      tiles,
    }));
  }

  public onTame(server: Server, { creatureId }: Protocol.TameParams): void {
    const creature = server.context.getCreature(creatureId);
    const isClose = true; // TODO
    if (!isClose) {
      return;
    }

    if (creature.isPlayer) return;
    if (creature.tamedBy) return;

    creature.tamedBy = server.currentClientConnection.player.id;
    server.broadcastPartialCreatureUpdate(creature, ['tamedBy']);
  }

  public onUse(server: Server, { toolIndex, loc, usageIndex }: Protocol.UseParams): void {
    if (!server.context.map.inBounds(loc)) {
      return;
    }

    const inventory = server.currentClientConnection.container;
    // If -1, use an item that represents "Hand".
    const tool = toolIndex === -1 ? { type: 0, quantity: 0 } : inventory.items[toolIndex];
    // Got a request to use nothing as a tool - doesn't make sense to do that.
    if (!tool) return;

    const focus = server.context.map.getItem(loc) || { type: 0, quantity: 0 };

    const uses = Content.getItemUses(tool.type, focus.type);
    if (!uses.length) return;
    const use = uses[usageIndex || 0];

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
    server.broadcast(ProtocolBuilder.setItem({
      ...loc,
      source: 0,
      item: usageResult.focus,
    }));
    for (const product of usageResult.products) {
      server.addItemNear(loc, product);
    }

    if (use.animation) {
      server.broadcast(ProtocolBuilder.animation({
        ...loc,
        key: use.animation,
      }));
    }

    if (use.skill && use.skillSuccessXp) {
      const skillUsed = Content.getSkills().find((skill) => skill.name === use.skill);
      if (skillUsed) server.grantXp(server.currentClientConnection, skillUsed.id, use.skillSuccessXp);
    }
  }

  public onAdminSetFloor(server: Server, { floor, ...loc }: Protocol.AdminSetFloorParams): void {
    if (!server.currentClientConnection.player.isAdmin) return;

    if (!server.context.map.inBounds(loc)) {
      return;
    }

    server.setFloor(loc, floor);
  }

  public onAdminSetItem(server: Server, { item, ...loc }: Protocol.AdminSetItemParams): void {
    if (!server.currentClientConnection.player.isAdmin) return;

    if (!server.context.map.inBounds(loc)) {
      return;
    }

    server.setItem(loc, item);
  }

  // moveItem handles movement between anywhere items can be - from the world to a player's
  // container, within a container, from a container to the world, or even between containers.
  // Note, containers have a fixed y value of 0. If "to" is null for a container, no location
  // is specified and the item will be place in the first viable slot.
  // TODO - better name than "source"? Maybe just generalize to "Container" where 0 refers to world?
  public async onMoveItem(server: Server, { from, fromSource, to, toSource }: Protocol.MoveItemParams) {
    async function boundsCheck(source: number, loc?: TilePoint) {
      if (source === ItemSourceWorld) {
        if (!loc) throw new Error('invariant violated');
        return server.context.map.inBounds(loc);
      } else {
        // No location specified, so no way it could be out of bounds.
        if (!loc) return true;

        const container = await server.context.getContainer(source);
        if (!container) return false;
        return loc.x < container.items.length;
      }
    }

    async function getItem(source: number, loc?: TilePoint) {
      if (!loc) return;
      if (source === ItemSourceWorld) {
        return server.context.map.getItem(loc);
      } else {
        const container = await server.context.getContainer(source);
        return container.items[loc.x];
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
      return;
    }

    // Ignore if moving to same location.
    if (fromSource === toSource && equalPoints(from, to)) {
      return;
    }

    const fromItem = await getItem(fromSource, from);

    let toItem = await getItem(toSource, to);

    // if (!server.inView(from) || !server.inView(to)) {
    //   return
    // }

    if (!fromItem) return;
    if (toItem && Content.getMetaItem(toItem.type).class === 'Container') {
      // Dragging to a container.
      toSource = server.context.getContainerIdFromItem(toItem);
      to = undefined;
      toItem = undefined;
    }
    if (toItem && fromItem.type !== toItem.type) return;

    if (!Content.getMetaItem(fromItem.type).moveable) {
      return;
    }

    // Prevent container-ception.
    if (Content.getMetaItem(fromItem.type).class === 'Container' && toSource === fromItem.containerId) {
      return;
    }

    if (toItem && toItem.type === fromItem.type) {
      fromItem.quantity += toItem.quantity;
    }

    setItem(fromSource, from, undefined);
    setItem(toSource, to, fromItem);

    // TODO queue changes and send to all clients.
    // context.queueTileChange(from)
    // context.queueTileChange(to)
  }
}
