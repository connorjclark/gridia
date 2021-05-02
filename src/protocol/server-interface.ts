import { MAX_STACK, MINE } from '../constants';
import * as Content from '../content';
import * as CommandParser from '../lib/command-parser';
import Server from '../server/server';
import * as Utils from '../utils';
import { makeBareMap } from '../mapgen';
import * as Container from '../container';
import IServerInterface from './gen/server-interface';
import * as EventBuilder from './event-builder';
import Commands = Protocol.Commands;

export default class ServerInterface implements IServerInterface {
  onMove(server: Server, { ...loc }: Commands.Move['params']): Promise<Commands.Move['response']> {
    if (!server.context.map.inBounds(loc)) {
      return Promise.reject('out of bounds');
    }

    const creature = server.currentClientConnection.creature;

    const tile = server.context.map.getTile(loc);
    if (tile.item?.type === MINE) {
      const player = server.currentClientConnection.player;
      const miningSkill = Content.getSkillByName('Mining');
      if (!miningSkill || !player.skills.has(miningSkill.id)) return Promise.reject('need mining skill');

      const container = server.currentClientConnection.container;
      const playerHasPick = Container.hasItem(container, Content.getMetaItemByName('Pick').id);
      if (!playerHasPick) return Promise.reject('missing pick');

      const staminaCost = 5;
      if (creature.stamina.current < staminaCost) return Promise.reject('you are exhausted');
      server.modifyCreatureStamina(null, creature, -staminaCost);

      const oreType = tile.item.oreType || Content.getMetaItemByName('Pile of Dirt').id;
      const minedItem = { type: oreType, quantity: 1 };
      server.setItem(loc, minedItem);
      server.broadcastAnimation(loc, 'MiningSound');
      server.grantXp(server.currentClientConnection, miningSkill.id, 10);
    }

    if (!server.context.walkable(loc)) return Promise.reject('not walkable');

    // if (!server.inView(loc)) {
    //   return false
    // }

    server.moveCreature(creature, loc);

    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  async onRegisterAccount(server: Server, { username, password }: Commands.RegisterAccount['params']): Promise<Commands.RegisterAccount['response']> {
    if (server.currentClientConnection.account) return Promise.reject('Already logged in');
    if (username.length > 20) return Promise.reject('Username too long');
    if (password.length < 8) return Promise.reject('Password too short');

    await server.registerAccount(server.currentClientConnection, {
      username,
      password,
    });
  }

  async onLogin(server: Server, { username, password }: Commands.Login['params']): Promise<Commands.Login['response']> {
    if (server.currentClientConnection.account) throw new Error('Already logged in');

    const account = await server.loginAccount(server.currentClientConnection, {
      username,
      password,
    });

    const players = [];
    for (const id of account.playerIds) {
      const player = server.players.get(id) || await server.context.loadPlayer(id);
      if (player) players.push({ id, name: player.name });
    }

    return { account, players };
  }

  onCreatePlayer(server: Server, args: Commands.CreatePlayer['params']): Promise<void> {
    return server.createPlayer(server.currentClientConnection, args);
  }

  // eslint-disable-next-line max-len
  async onEnterWorld(server: Server, { playerId }: Commands.EnterWorld['params']): Promise<Commands.EnterWorld['response']> {
    if (!server.currentClientConnection.account) throw new Error('Not logged in');
    if (server.currentClientConnection.player) throw new Error('Already in world');
    if (!server.currentClientConnection.account.playerIds.includes(playerId)) throw new Error('No such player');

    await server.playerEnterWorld(server.currentClientConnection, {
      playerId,
    });
  }

  onLogout(server: Server, { }: Commands.Logout['params']): Promise<Commands.Logout['response']> {
    server.removeClient(server.currentClientConnection);
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  async onRequestContainer(server: Server, { containerId, loc }: Commands.RequestContainer['params']): Promise<Commands.RequestContainer['response']> {
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
    server.reply(EventBuilder.container({ container }));
  }

  // eslint-disable-next-line max-len
  onCloseContainer(server: Server, { containerId }: Commands.CloseContainer['params']): Promise<Commands.CloseContainer['response']> {
    const index = server.currentClientConnection.registeredContainers.indexOf(containerId);
    if (index !== -1) {
      server.currentClientConnection.registeredContainers.splice(index, 1);
    }
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onRequestCreature(server: Server, { id }: Commands.RequestCreature['params']): Promise<Commands.RequestCreature['response']> {
    const creature = server.context.getCreature(id);
    if (!creature) {
      return Promise.reject('requested invalid creature: ' + id);
    }

    server.reply(EventBuilder.setCreature({
      partial: false,
      ...creature,
    }));
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onRequestPartition(server: Server, { w }: Commands.RequestPartition['params']): Promise<Commands.RequestPartition['response']> {
    const partition = server.context.map.getPartition(w);
    server.reply(EventBuilder.initializePartition({
      w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));
    return Promise.resolve();
  }

  async onRequestSector(server: Server, { ...loc }: Commands.RequestSector['params']) {
    const isClose = true; // TODO
    if (loc.x < 0 || loc.y < 0 || loc.z < 0 || !isClose) {
      return;
    }

    const tiles: Tile[][] = JSON.parse(JSON.stringify(await server.ensureSectorLoaded(loc)));
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < tiles.length; i++) {
      for (let j = 0; j < tiles[0].length; j++) {
        const tile = tiles[i][j];
        if (tile.item?.oreType) {
          delete tile.item.oreType;
        }
      }
    }

    server.reply(EventBuilder.sector({
      ...loc,
      tiles,
    }));
  }

  // eslint-disable-next-line max-len
  onCreatureAction(server: Server, { creatureId, type }: Commands.CreatureAction['params']): Promise<Commands.CreatureAction['response']> {
    const creature = server.context.getCreature(creatureId);
    const isClose = true; // TODO
    if (!isClose) {
      return Promise.reject('Too far away');
    }

    if (!creature || creature.isPlayer) return Promise.reject('Cannot do that to another player');

    if (type === 'attack') {
      server.creatureStates[server.currentClientConnection.creature.id].targetCreature =
        server.creatureStates[creatureId];
    }

    if (type === 'tame') {
      if (creature.tamedBy) return Promise.reject('Creature is already tamed');
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
          section: 'World',
          from: creature.name,
          text: '...',
        }));
      }
    }

    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onDialogueResponse(server: Server, { choiceIndex }: Commands.DialogueResponse['params']): Promise<Commands.DialogueResponse['response']> {
    server.processDialogueResponse(server.currentClientConnection, choiceIndex);
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onUse(server: Server, { toolIndex, location, usageIndex }: Commands.Use['params']): Promise<Commands.Use['response']> {
    if (location.source === 'container') {
      return Promise.reject(); // TODO
    }
    const loc = location.loc;

    if (!server.context.map.inBounds(loc)) {
      return Promise.reject(); // TODO
    }

    const inventory = server.currentClientConnection.container;
    // If -1, use an item that represents "Hand".
    const tool = toolIndex === -1 ? { type: 0, quantity: 0 } : inventory.items[toolIndex];
    // Got a request to use nothing as a tool - doesn't make sense to do that.
    if (!tool) return Promise.reject(); // TODO

    const focus = server.context.map.getItem(loc) || { type: 0, quantity: 0 };

    const uses = Content.getItemUses(tool.type, focus.type);
    if (!uses.length) return Promise.reject(); // TODO
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
      const containerLocation = Container.findValidLocationToAddItemToContainer(inventory, usageResult.successTool, {
        allowStacking: true,
      });
      if (containerLocation && containerLocation.index !== undefined) {
        server.setItemInContainer(containerLocation.id, containerLocation.index, usageResult.successTool);
      } else {
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

    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onAdminSetFloor(server: Server, { floor, ...loc }: Commands.AdminSetFloor['params']): Promise<Commands.AdminSetFloor['response']> {

    server.setFloor(loc, floor);
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onAdminSetItem(server: Server, { item, ...loc }: Commands.AdminSetItem['params']): Promise<Commands.AdminSetItem['response']> {
    if (!server.currentClientConnection.player.isAdmin) return Promise.reject(); // TODO

    if (!server.context.map.inBounds(loc)) {
      return Promise.reject(); // TODO
    }

    server.setItem(loc, item);
    return Promise.resolve();
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

      if (container.type === 'equipment') {
        const requiredSkill = Content.getMetaItem(item.type).combatSkill;
        if (requiredSkill && !server.currentClientConnection.player.skills.has(requiredSkill)) {
          return {
            error: `Missing ${Content.getSkill(requiredSkill).name} skill`,
          };
        }
      }

      if (location.index === undefined) {
        // Don't allow stacking if this is an item split operation.
        const allowStacking = quantity === undefined;
        return Container.findValidLocationToAddItemToContainer(container, item, { allowStacking }) || {
          error: 'No possible location for that item in this container.',
        };
      } else {
        if (!Container.isValidLocationToAddItemInContainer(container, location.index, item)) {
          return {
            error: 'Not a valid location for that item in this container.',
          };
        }

        return location;
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

    if (!await boundsCheck(from) || !await boundsCheck(to)) {
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
        section: 'World',
        from: 'World',
        text: validToLocation.error,
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
        section: 'World',
        from: 'World',
        text: 'That item is not moveable',
      }));
      return;
    }

    // Prevent container-ception.
    if (Content.getMetaItem(fromItem.type).class === 'Container' && to.source === 'container'
      && to.id === fromItem.containerId) {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You cannot store a container inside another container',
      }));
      return;
    }

    const isStackable = Content.getMetaItem(fromItem.type).stackable && fromItem.type === toItem?.type;
    const quantityToMove = quantity !== undefined ? quantity : fromItem.quantity;

    if (isStackable && quantityToMove + (toItem?.quantity || 0) > MAX_STACK) {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'Item stack would be too large.',
      }));
      return;
    }

    const newItem = {
      ...fromItem,
      quantity: quantityToMove,
    };
    if (toItem && isStackable) {
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

  onChat(server: Server, { text }: Commands.Chat['params']): Promise<Commands.Chat['response']> {
    if (text.startsWith('/')) {
      const parsedCommand = CommandParser.parseCommand(text.substring(1));

      const COMMANDS: Record<string, CommandParser.Command> = {
        warp: {
          args: [
            { name: 'x', type: 'number' },
            { name: 'y', type: 'number' },
            { name: 'z', type: 'number', optional: true },
            { name: 'map', type: 'number', optional: true },
          ],
          do(args: { x: number; y: number; z?: number; map?: number }) {
            const destination = { ...server.currentClientConnection.creature.pos };
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

            server.warpCreature(server.currentClientConnection.creature, destination);
          },
        },
        creature: {
          args: [
            { name: 'name', type: 'string' },
          ],
          do(args: { name: string }) {
            const template = Content.getMonsterTemplateByNameNoError(args.name);
            if (!template) {
              server.reply(EventBuilder.chat({
                section: 'World',
                from: 'SERVER',
                text: `No monster named ${args.name}`,
              }));
              return;
            }

            const loc = server.findNearest(server.currentClientConnection.creature.pos, 10, true,
              (_, l) => server.context.walkable(l));
            if (loc) {
              server.makeCreatureFromTemplate(template, loc);
            }
          },
        },
        item: {
          args: [
            { name: 'nameOrId', type: 'string' },
            { name: 'quantity', type: 'number', optional: true },
          ],
          do(args: { nameOrId: string; quantity?: number }) {
            let meta;
            if (args.nameOrId.match(/\d+/)) {
              meta = Content.getMetaItem(parseInt(args.nameOrId, 10));
            } else {
              meta = Content.getMetaItemByName(args.nameOrId);
            }
            if (!meta) {
              server.reply(EventBuilder.chat({
                section: 'World',
                from: 'SERVER',
                text: `No item: ${args.nameOrId}`,
              }));
              return;
            }

            let quantity = args.quantity || 1;
            if (quantity > MAX_STACK) quantity = MAX_STACK;

            const loc = server.findNearest(server.currentClientConnection.creature.pos, 10, true,
              (t) => !t.item);
            if (loc) {
              server.setItem(loc, { type: meta.id, quantity });
            }
          },
        },
        time: {
          args: [],
          do() {
            server.currentClientConnection.sendEvent(EventBuilder.chat({
              section: 'World',
              from: 'World',
              text: `The time is ${server.time.toString()}`,
            }));
          },
        },
        who: {
          args: [],
          do() {
            server.currentClientConnection.sendEvent(EventBuilder.chat({
              section: 'World',
              from: 'World',
              text: server.getMessagePlayersOnline(),
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
                section: 'World',
                from: 'World',
                text: `Made partition ${nextPartitionId}`,
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
            { name: 'file', type: 'string', optional: true },
            { name: 'type', type: 'number', optional: true },
          ],
          do(args: { index: number; file?: string; type?: number }) {
            server.currentClientConnection.creature.graphics = {
              file: args.file || 'rpgwo-player0.png',
              index: args.index,
              imageType: args.type || 0,
            };
            server.broadcastPartialCreatureUpdate(server.currentClientConnection.creature, ['graphics']);
          },
        },
        xp: {
          args: [
            { name: 'skillName', type: 'string' },
            { name: 'xp', type: 'number' },
          ],
          do(args: { skillName: string; xp: number }) {
            const skill = Content.getSkillByName(args.skillName);
            if (!skill) {
              server.reply(EventBuilder.chat({
                section: 'World',
                from: 'SERVER',
                text: `No skill named ${args.skillName}`,
              }));
              return;
            }

            server.grantXp(server.currentClientConnection, skill.id, args.xp);
          },
        },
        animation: {
          args: [
            { name: 'name', type: 'string' },
          ],
          do(args: { name: string }) {
            const animation = Content.getAnimation(args.name);
            if (!animation) {
              server.reply(EventBuilder.chat({
                section: 'World',
                from: 'SERVER',
                text: `No animation named ${args.name}`,
              }));
              return;
            }

            server.broadcastAnimation(server.currentClientConnection.creature.pos, args.name);
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
            server.reply(EventBuilder.chat({
              section: 'World',
              from: 'SERVER',
              text: messageBody,
            }));
          },
        },
      };

      // @ts-ignore
      const command = COMMANDS[parsedCommand.commandName];
      if (!command) {
        server.reply(EventBuilder.chat({
          section: 'World',
          from: 'SERVER',
          text: `unknown command: ${text}`,
        }));
        return Promise.reject();
      }

      const parsedArgs = CommandParser.parseArgs(parsedCommand.argsString, command.args);
      if ('error' in parsedArgs) {
        server.reply(EventBuilder.chat({
          section: 'World',
          from: 'SERVER',
          text: `error: ${parsedArgs.error}`,
        }));
        return Promise.reject();
      }

      const maybeError = command.do(parsedArgs);
      if (maybeError) {
        server.reply(EventBuilder.chat({
          section: 'World',
          from: 'SERVER',
          text: `error: ${maybeError}`,
        }));
      }
    } else {
      server.broadcastChat({
        from: server.currentClientConnection.player.name,
        text,
      });
    }

    return Promise.resolve();
  }
}
