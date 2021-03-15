import { MINE } from '../constants';
import * as Content from '../content';
import * as CommandParser from '../lib/command-parser';
import Server from '../server/server';
import * as Utils from '../utils';
import { makeBareMap } from '../mapgen';
import IServerInterface from './gen/server-interface';
import * as EventBuilder from './event-builder';
import Commands = Protocol.Commands;

export default class ServerInterface implements IServerInterface {
  onMove(server: Server, { ...loc }: Commands.Move['params']): Commands.Move['response'] {
    if (!server.context.map.inBounds(loc)) {
      return;
    }

    if (server.context.map.getTile(loc).item?.type === MINE) {
      const container = server.currentClientConnection.container;
      const playerHasPick = container.hasItem(Content.getMetaItemByName('Pick').id);
      if (!playerHasPick) return;

      const minedItem = { type: Content.getRandomMetaItemOfClass('Ore').id, quantity: 1 };
      server.setItem(loc, minedItem);
      server.broadcastAnimation(loc, 'MiningSound');
    }

    if (!server.context.walkable(loc)) return;

    // if (!server.inView(loc)) {
    //   return false
    // }

    const creature = server.currentClientConnection.player.creature;
    server.moveCreature(creature, loc);
  }

  onRegister(server: Server, { name, password }: Commands.Register['params']): Commands.Register['response'] {
    if (server.currentClientConnection.player) return;
    if (name.length > 20) return;
    if (password.length < 8) return;

    server.registerPlayer(server.currentClientConnection, {
      name,
      password,
    });
  }

  onLogin(server: Server, { name, password }: Commands.Login['params']): Commands.Login['response'] {
    if (server.currentClientConnection.player) return;

    const playerId = server.context.playerNamesToIds.get(name);
    if (!playerId) throw new Error('invalid player name');

    server.loginPlayer(server.currentClientConnection, {
      playerId,
      password,
    });
  }

  onLogout(server: Server, { }: Commands.Logout['params']): Commands.Logout['response'] {
    server.removeClient(server.currentClientConnection);
  }

  // eslint-disable-next-line max-len
  async onRequestContainer(server: Server, { containerId, loc }: Commands.RequestContainer['params']): Commands.RequestContainer['response'] {
    if (!containerId && !loc) throw new Error('expected containerId or loc');
    if (containerId && loc) throw new Error('expected only one of containerId or loc');

    if (!containerId && loc) {
      const item = server.context.map.getItem(loc);
      if (item) containerId = server.context.getContainerIdFromItem(item);
    }

    const isClose = true; // TODO
    if (!isClose) {
      // @ts-ignore
      return;
    }

    if (!containerId) {
      throw new Error('could not find container');
    }

    server.currentClientConnection.registeredContainers.push(containerId);
    const container = await server.context.getContainer(containerId);
    return { container };
  }

  // eslint-disable-next-line max-len
  onCloseContainer(server: Server, { containerId }: Commands.CloseContainer['params']): Commands.CloseContainer['response'] {
    const index = server.currentClientConnection.registeredContainers.indexOf(containerId);
    if (index !== -1) {
      server.currentClientConnection.registeredContainers.splice(index, 1);
    }
  }

  onRequestCreature(server: Server, { id }: Commands.RequestCreature['params']): Commands.RequestCreature['response'] {
    const creature = server.context.getCreature(id);
    if (!creature) {
      console.error('client requested invalid creature:', id);
      return;
    }

    server.reply(EventBuilder.setCreature({
      partial: false,
      ...creature,
    }));
  }

  // eslint-disable-next-line max-len
  onRequestPartition(server: Server, { w }: Commands.RequestPartition['params']): Commands.RequestPartition['response'] {
    const partition = server.context.map.getPartition(w);
    server.reply(EventBuilder.initializePartition({
      w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));
  }

  async onRequestSector(server: Server, { ...loc }: Commands.RequestSector['params']) {
    const isClose = true; // TODO
    if (loc.x < 0 || loc.y < 0 || loc.z < 0 || !isClose) {
      return;
    }

    const tiles = await server.ensureSectorLoaded(loc);

    server.reply(EventBuilder.sector({
      ...loc,
      tiles,
    }));
  }

  // eslint-disable-next-line max-len
  onCreatureAction(server: Server, { creatureId, type }: Commands.CreatureAction['params']): Commands.CreatureAction['response'] {
    const creature = server.context.getCreature(creatureId);
    const isClose = true; // TODO
    if (!isClose) {
      return;
    }

    if (!creature || creature.isPlayer) return;

    if (type === 'attack') {
      server.creatureStates[server.currentClientConnection.player.creature.id].targetCreature =
        server.creatureStates[creatureId];
    }

    if (type === 'tame') {
      if (creature.tamedBy) return;
      creature.tamedBy = server.currentClientConnection.player.id;
      server.broadcastPartialCreatureUpdate(creature, ['tamedBy']);
    }

    if (type === 'speak') {
      const cb = server.creatureToOnSpeakCallbacks.get(creature);
      const dialogue = cb && cb(server.currentClientConnection);
      if (dialogue) {
        server.startDialogue(server.currentClientConnection, dialogue);
      } else {
        server.reply(EventBuilder.chat({
          from: creature.name,
          to: '', // TODO
          message: '...',
        }));
      }
    }
  }

  // eslint-disable-next-line max-len
  onDialogueResponse(server: Server, { choiceIndex }: Commands.DialogueResponse['params']): Commands.DialogueResponse['response'] {
    server.processDialogueResponse(server.currentClientConnection, choiceIndex);
  }

  onUse(server: Server, { toolIndex, location, usageIndex }: Commands.Use['params']): Commands.Use['response'] {
    if (location.source === 'container') {
      return; // TODO
    }
    const loc = location.loc;

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
      const containerLocation = inventory.findValidLocationToAddItemToContainer(usageResult.successTool, {
        allowStacking: true,
      });
      if (containerLocation && containerLocation.index !== undefined) {
        server.setItemInContainer(containerLocation.id, containerLocation.index, usageResult.successTool);
        server.addItemNear(loc, usageResult.successTool);
      }
    }

    server.setItemInContainer(inventory.id, toolIndex, usageResult.tool);
    server.context.map.getTile(loc).item = usageResult.focus;
    server.broadcast(EventBuilder.setItem({
      location: Utils.ItemLocation.World(loc),
      item: usageResult.focus,
    }));
    for (const product of usageResult.products) {
      server.addItemNear(loc, product);
    }

    if (use.animation) {
      server.broadcastAnimation(loc, use.animation);
    }

    if (use.successFloor) {
      server.setFloor(loc, use.successFloor);
    }

    if (use.skill && use.skillSuccessXp) {
      const skillUsed = Content.getSkills().find((skill) => skill.name === use.skill);
      if (skillUsed) server.grantXp(server.currentClientConnection, skillUsed.id, use.skillSuccessXp);
    }
  }

  // eslint-disable-next-line max-len
  onAdminSetFloor(server: Server, { floor, ...loc }: Commands.AdminSetFloor['params']): Commands.AdminSetFloor['response'] {
    if (!server.currentClientConnection.player.isAdmin) return;

    if (!server.context.map.inBounds(loc)) {
      return;
    }

    server.setFloor(loc, floor);
  }

  onAdminSetItem(server: Server, { item, ...loc }: Commands.AdminSetItem['params']): Commands.AdminSetItem['response'] {
    if (!server.currentClientConnection.player.isAdmin) return;

    if (!server.context.map.inBounds(loc)) {
      return;
    }

    server.setItem(loc, item);
  }

  // moveItem handles movement between anywhere items can be - from the world to a player's
  // container, within a container, from a container to the world, or even between containers.
  // If "to" is null for a container, no location is specified and the item will be place in the first viable slot.
  async onMoveItem(server: Server, { from, quantity, to }: Commands.MoveItem['params']) {
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

    function findValidLocation(location: ItemLocation, item: Item): ItemLocation | { error: string } {
      if (location.source === 'world') {
        return location;
      }

      const container = server.context.containers.get(location.id);
      if (!container) {
        return { error: 'Container does not exist.' };
      }

      if (location.index === undefined) {
        // Don't allow stacking if this is an item split operation.
        const allowStacking = quantity === undefined;
        return container.findValidLocationToAddItemToContainer(item, { allowStacking }) || {
          error: 'No possible location for that item in this container.',
        };
      } else {
        if (container.isValidLocationToAddItemInContainer(location.index, item)) {
          return location;
        } else {
          return {
            error: 'Not a valid location for that item in this container.',
          };
        }
      }
    }

    function setItem(location: ItemLocation, item: Item) {
      if (location.source === 'world') {
        if (!location.loc) throw new Error('invariant violated');
        server.setItem(location.loc, item);
      } else {
        if (location.index === undefined) throw new Error('invariant violated');
        server.setItemInContainer(location.id, location.index, item);
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
    if (!fromItem) {
      return;
    }

    // Dragging to a container.
    if (to.source === 'world') {
      const itemInWorld = await getItem(to);
      if (itemInWorld && Content.getMetaItem(itemInWorld.type).class === 'Container') {
        to = { source: 'container', id: server.context.getContainerIdFromItem(itemInWorld) };
      }
    }

    const validToLocation = findValidLocation(to, fromItem);
    if ('error' in validToLocation) {
      server.reply(EventBuilder.chat({
        from: 'World',
        to: '', // TODO
        message: validToLocation.error,
      }));
      return;
    }

    // Ignore if moving to same location.
    if (Utils.ItemLocation.Equal(from, validToLocation)) {
      return;
    }

    // if (!server.inView(from) || !server.inView(to)) {
    //   return
    // }

    const toItem = await getItem(validToLocation);
    if (toItem && fromItem.type !== toItem.type) return;

    if (!server.currentClientConnection.player.isAdmin && !Content.getMetaItem(fromItem.type).moveable) {
      server.reply(EventBuilder.chat({
        from: 'World',
        to: '', // TODO
        message: 'That item is not moveable',
      }));
      return;
    }

    // Prevent container-ception.
    if (Content.getMetaItem(fromItem.type).class === 'Container' && to.source === 'container'
      && to.id === fromItem.containerId) {
      server.reply(EventBuilder.chat({
        from: 'World',
        to: '', // TODO
        message: 'You cannot store a container inside another container',
      }));
      return;
    }

    const quantityToMove = quantity !== undefined ? quantity : fromItem.quantity;
    const newItem = {
      ...fromItem,
      quantity: quantityToMove,
    };
    if (toItem && toItem.type === fromItem.type) {
      newItem.quantity += toItem.quantity;
    }

    setItem(validToLocation, newItem);

    if (quantityToMove === fromItem.quantity) {
      clearItem(from);
    } else {
      setItem(from, { ...fromItem, quantity: fromItem.quantity - quantityToMove });
    }

    // TODO queue changes and send to all clients.
    // context.queueTileChange(from)
    // context.queueTileChange(to)
  }

  onChat(server: Server, { to, message }: Commands.Chat['params']): Commands.Chat['response'] {
    if (message.startsWith('/')) {
      const parsedCommand = CommandParser.parseCommand(message.substring(1));

      const COMMANDS: Record<string, CommandParser.Command> = {
        warp: {
          args: [
            { name: 'x', type: 'number' },
            { name: 'y', type: 'number' },
            { name: 'z', type: 'number', optional: true },
            { name: 'map', type: 'number', optional: true },
          ],
          do(args: { x: number; y: number; z?: number; map?: number }) {
            const destination = { ...server.currentClientConnection.player.creature.pos };
            if (args.z !== undefined && args.map !== undefined) {
              destination.w = args.map;
              destination.x = args.x;
              destination.y = args.y;
              destination.z = args.z;
            } else if (args.z !== undefined) {
              destination.x = args.x;
              destination.y = args.y;
              destination.z = args.z;
            } else {
              destination.x = args.x;
              destination.y = args.y;
            }

            if (!server.context.map.inBounds(destination)) {
              return 'out of bounds';
            }

            if (!server.context.walkable(destination)) {
              // Don't check this?
              return 'not walkable';
            }

            server.warpCreature(server.currentClientConnection.player.creature, destination);
          },
        },
        spawn: {
          args: [
            { name: 'name', type: 'string' },
          ],
          do(args: { name: string }) {
            const template = Content.getMonsterTemplateByNameNoError(args.name);
            if (!template) {
              server.reply(EventBuilder.chat({ from: 'SERVER', to, message: `No monster named ${args.name}` }));
              return;
            }

            const loc = server.findNearest(server.currentClientConnection.player.creature.pos, 10, true,
              (_, l) => server.context.walkable(l));
            if (loc) {
              server.makeCreatureFromTemplate(template, loc);
            }
          },
        },
        time: {
          args: [],
          do() {
            server.currentClientConnection.sendEvent(EventBuilder.chat({
              from: 'World',
              to: '', // TODO
              message: `The time is ${server.time.toString()}`,
            }));
          },
        },
        who: {
          args: [],
          do() {
            server.currentClientConnection.sendEvent(EventBuilder.chat({
              from: 'World',
              to: '', // TODO
              message: server.getMessagePlayersOnline(),
            }));
          },
        },
        newPartition: {
          args: [
          ],
          do() {
            const nextPartitionId = Math.max(...server.context.map.partitions.keys()) + 1;
            const partition = makeBareMap(100, 100, 1);
            server.context.map.addPartition(nextPartitionId, partition);
            server.save().then(() => {
              partition.loaded = true;
              server.currentClientConnection.sendEvent(EventBuilder.chat({
                from: 'World',
                to: '', // TODO
                message: `Made partition ${nextPartitionId}`,
              }));
            });
          },
        },
        advanceTime: {
          args: [
            { name: 'ticks', type: 'number' },
          ],
          help: `1 hour=${server.ticksPerWorldDay / 24}`,
          do(args: { ticks: number }) {
            server.advanceTime(args.ticks);
          },
        },
        save: {
          args: [],
          do() {
            server.save();
          },
        },
        image: {
          args: [
            { name: 'index', type: 'number' },
            { name: 'type', type: 'number', optional: true },
          ],
          do(args: { index: number; type?: number }) {
            server.currentClientConnection.player.creature.image = args.index;
            server.currentClientConnection.player.creature.image_type = args.type || 0;
            server.broadcastPartialCreatureUpdate(
              server.currentClientConnection.player.creature, ['image', 'image_type']);
          },
        },
        help: {
          args: [],
          do() {
            let messageBody = 'Commands:\n';
            const sortedCommands = Object.entries(COMMANDS).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [commandName, data] of sortedCommands) {
              const args = data.args.map((a) => `${a.name} [${a.type}${a.optional ? '?' : ''}]`).join(' ');
              messageBody += `/${commandName} ${args}\n`;
              if (data.help) messageBody += `  ${data.help}\n`;
            }
            server.reply(EventBuilder.chat({ from: 'SERVER', to, message: messageBody }));
          },
        },
      };

      // @ts-ignore
      const command = COMMANDS[parsedCommand.commandName];
      if (!command) {
        server.reply(EventBuilder.chat({ from: 'SERVER', to, message: `unknown command: ${message}` }));
        return;
      }

      const parsedArgs = CommandParser.parseArgs(parsedCommand.argsString, command.args);
      if ('error' in parsedArgs) {
        server.reply(EventBuilder.chat({ from: 'SERVER', to, message: `error: ${parsedArgs.error}` }));
        return;
      }

      const maybeError = command.do(parsedArgs);
      if (maybeError) {
        server.reply(EventBuilder.chat({ from: 'SERVER', to, message: `error: ${maybeError}` }));
      }
    } else {
      server.broadcast(EventBuilder.chat({ from: server.currentClientConnection.player.name, to, message }));
    }
  }
}
