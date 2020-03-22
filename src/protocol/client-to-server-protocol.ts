import { MINE, Source } from '../constants';
import * as Content from '../content';
import Server from '../server/server';
import * as Utils from '../utils';
import IClientToServerProtocol from './gen/client-to-server-protocol';
import * as ProtocolBuilder from './server-to-client-protocol-builder';
import Params = ClientToServerProtocol.Params;

export default class ClientToServerProtocol implements IClientToServerProtocol {
  public onMove(server: Server, { ...loc }: Params.Move): void {
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
      server.addItemNear(loc, { type: Content.getRandomMetaItemOfClass('Ore').id, quantity: 1 });
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

  public onRegister(server: Server, { name }: Params.Register): void {
    if (server.currentClientConnection.player) return;
    if (name.length > 20) return;

    server.registerPlayer(server.currentClientConnection, {
      name,
    });
  }

  public async onRequestContainer(server: Server, { containerId, loc }: Params.RequestContainer) {
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

  public onCloseContainer(server: Server, { containerId }: Params.CloseContainer): void {
    const index = server.currentClientConnection.registeredContainers.indexOf(containerId);
    if (index !== -1) {
      server.currentClientConnection.registeredContainers.splice(index, 1);
    }
  }

  public onRequestCreature(server: Server, { id }: Params.RequestCreature): void {
    server.reply(ProtocolBuilder.setCreature({
      partial: false,
      ...server.context.getCreature(id),
    }));
  }

  public onRequestPartition(server: Server, { w }: Params.RequestPartition): void {
    const partition = server.context.map.getPartition(w);
    server.reply(ProtocolBuilder.initializePartition({
      w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));
  }

  public async onRequestSector(server: Server, { ...loc }: Params.RequestSector) {
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

  public onTame(server: Server, { creatureId }: Params.Tame): void {
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

  public onUse(server: Server, { toolIndex, loc, usageIndex }: Params.Use): void {
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
      products: use.products.map((product) => ({ ...product })) as Item[],
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
      location: Utils.ItemLocation.World(loc),
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

  public onAdminSetFloor(server: Server, { floor, ...loc }: Params.AdminSetFloor): void {
    if (!server.currentClientConnection.player.isAdmin) return;

    if (!server.context.map.inBounds(loc)) {
      return;
    }

    server.setFloor(loc, floor);
  }

  public onAdminSetItem(server: Server, { item, ...loc }: Params.AdminSetItem): void {
    if (!server.currentClientConnection.player.isAdmin) return;

    if (!server.context.map.inBounds(loc)) {
      return;
    }

    server.setItem(loc, item);
  }

  // moveItem handles movement between anywhere items can be - from the world to a player's
  // container, within a container, from a container to the world, or even between containers.
  // If "to" is null for a container, no location is specified and the item will be place in the first viable slot.
  public async onMoveItem(server: Server, { from, to }: Params.MoveItem) {
    async function boundsCheck(location: ItemLocation) {
      if (location.source === 'world') {
        if (!location.loc) throw new Error('invariant violated');
        return server.context.map.inBounds(location.loc);
      } else {
        // No location specified, so no way it could be out of bounds.
        if (!location.index) return true;

        const container = await server.context.getContainer(location.id);
        if (!container) return false;
        return location.index < container.items.length;
      }
    }

    async function getItem(location: ItemLocation) {
      if (location.source === 'world') {
        if (!location.loc) return;
        return server.context.map.getItem(location.loc);
      } else {
        if (location.index === undefined) return;
        const container = await server.context.getContainer(location.id);
        return container.items[location.index];
      }
    }

    function setItem(location: ItemLocation, item: Item) {
      if (location.source === 'world') {
        if (!location.loc) throw new Error('invariant violated');
        server.setItem(location.loc, item);
      } else {
        server.addItemToContainer(location.id, location.index, item);
      }
    }

    function clearItem(location: ItemLocation) {
      if (location.source === 'world') {
        server.setItem(location.loc, undefined);
      } else {
        if (location.index === undefined) throw new Error('invariant violated');
        server.setItemInContainer(location.id, location.index, undefined);
      }
    }

    // Ignore if moving to same location.
    if (Utils.ItemLocation.Equal(from, to)) {
      return;
    }

    if (!boundsCheck(from) || !boundsCheck(to)) {
      return;
    }

    const fromItem = await getItem(from);

    let toItem = await getItem(to);

    // if (!server.inView(from) || !server.inView(to)) {
    //   return
    // }

    if (!fromItem) return;
    if (toItem && Content.getMetaItem(toItem.type).class === 'Container') {
      // Dragging to a container.
      to = { source: 'container', id: server.context.getContainerIdFromItem(toItem) };
      toItem = undefined;
    }
    if (toItem && fromItem.type !== toItem.type) return;

    if (!Content.getMetaItem(fromItem.type).moveable) {
      return;
    }

    // Prevent container-ception.

    if (Content.getMetaItem(fromItem.type).class === 'Container' && to.source === 'container'
      && to.id === fromItem.containerId) {
      return;
    }

    if (toItem && toItem.type === fromItem.type) {
      fromItem.quantity += toItem.quantity;
    }

    clearItem(from);
    setItem(to, fromItem);

    // TODO queue changes and send to all clients.
    // context.queueTileChange(from)
    // context.queueTileChange(to)
  }

  public onChat(server: Server, { to, message }: Params.Chat): void {
    if (message.startsWith('/')) {
      const [command, ...args] = message.substring(1).split(' ');

      const commands = {
        warp() {
          const destination = { ...server.currentClientConnection.player.creature.pos };
          if (args.length === 2) {
            destination.x = Number(args[0]);
            destination.y = Number(args[1]);
          } else if (args.length === 3) {
            destination.x = Number(args[0]);
            destination.y = Number(args[1]);
            destination.z = Number(args[2]);
          } else if (args.length === 4) {
            destination.w = Number(args[0]);
            destination.x = Number(args[1]);
            destination.y = Number(args[2]);
            destination.z = Number(args[3]);
          } else {
            return 'incorrect number of arguments';
          }

          if (!server.context.map.inBounds(destination)) {
            return 'out of bounds';
          }

          if (!server.context.map.walkable(destination)) {
            // Don't check this?
            return 'not walkable';
          }

          server.warpCreature(server.currentClientConnection.player.creature, destination);
        },
      };

      // @ts-ignore
      const commandFn = commands[command];
      if (commandFn) {
        const error = commandFn();
        if (error) {
          server.reply(ProtocolBuilder.chat({ from: 'SERVER', to, message: `error: ${error}` }));
        }
      } else {
        server.reply(ProtocolBuilder.chat({ from: 'SERVER', to, message: `unknown command: ${message}` }));
      }
    } else {
      server.broadcast(ProtocolBuilder.chat({ from: server.currentClientConnection.player.name, to, message }));
    }
  }
}
