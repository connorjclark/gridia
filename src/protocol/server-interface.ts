import {MAX_STACK, MINE, SECTOR_SIZE, WATER} from '../constants';
import * as Container from '../container';
import * as Content from '../content';
import * as CommandParser from '../lib/command-parser';
import {makeBareMap} from '../mapgen';
import * as Player from '../player';
import {attributeCheck} from '../server/creature-utils';
import {Server} from '../server/server';
import * as Utils from '../utils';

import * as EventBuilder from './event-builder';
import {ICommands} from './gen/server-interface';

import Commands = Protocol.Commands;

export class ServerInterface implements ICommands {
  onMove(server: Server, {...loc}: Commands.Move['params']): Promise<Commands.Move['response']> {
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
      const minedItem = {type: oreType, quantity: 1};
      server.setItem(loc, minedItem);
      server.broadcastAnimation({
        name: 'MiningSound',
        path: [loc],
      });
      server.grantXp(server.currentClientConnection, miningSkill.id, 10);
    }

    if (!server.context.walkable(loc)) return Promise.reject('not walkable');

    // TODO: generalize
    if (tile.floor === WATER && Content.getBaseDir() === 'worlds/rpgwo-world') {
      server.creatureStates[creature.id].resetRegenerationTimer(server);
      if (attributeCheck(creature, 'stamina', 1)) {
        server.modifyCreatureStamina(null, creature, -2);
      } else {
        server.modifyCreatureLife(null, creature, -2);
      }
    }

    // if (!server.inView(loc)) {
    //   return false
    // }

    server.moveCreature(creature, loc);

    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  async onRegisterAccount(server: Server, {firebaseToken}: Commands.RegisterAccount['params']): Promise<Commands.RegisterAccount['response']> {
    if (server.currentClientConnection.account) return Promise.reject('Already logged in');

    if (process.title === 'browser') {
      throw new Error('should not use firebase locally');
    }

    // TODO: do not include firebase-admin in worker server.
    const firebaseAdmin = await import('firebase-admin');
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(firebaseToken, true);
    const id = decodedToken.uid;

    await server.registerAccount(server.currentClientConnection, {
      id,
    });
  }

  async onLogin(server: Server, {firebaseToken}: Commands.Login['params']): Promise<Commands.Login['response']> {
    if (server.currentClientConnection.account) throw new Error('Already logged in');

    let account: GridiaAccount;
    if (process.title === 'browser') {
      if (firebaseToken !== 'local') throw new Error('expected token: local');

      // Create account if not already made.
      try {
        await server.registerAccount(server.currentClientConnection, {
          id: 'local',
        });
      } catch {
        // ...
      }
      account = await server.loginAccount(server.currentClientConnection, {
        id: 'local',
      });
    } else {
      // TODO: do not include firebase-admin in worker server.
      const firebaseAdmin = await import('firebase-admin');
      const decodedToken = await firebaseAdmin.auth().verifyIdToken(firebaseToken, true);

      // Account data is saved on the filesystem, which is frequently cleared since
      // the game is under heavy development. For now, just remake an account for this
      // firebase id when needed.
      if (!await server.context.accountExists(decodedToken.uid)) {
        await server.registerAccount(server.currentClientConnection, {id: decodedToken.uid});
      }

      account = await server.loginAccount(server.currentClientConnection, {
        id: decodedToken.uid,
      });
    }

    const players = [];
    const imageDatas = [];
    for (const playerId of account.playerIds) {
      const player = await server.context.getPlayer(playerId);
      if (!player) continue;

      const equipment = await server.context.getContainer(player.equipmentContainerId);
      if (!equipment) continue;

      players.push(player);
      imageDatas.push(server.makeCreatureImageData(equipment));
    }

    // No real reason to keep this secret, but the client never needs to know this id.
    account = {...account, id: '<removed>'};
    return {account, players, imageDatas};
  }

  onCreatePlayer(server: Server, args: Commands.CreatePlayer['params']): Promise<void> {
    return server.createPlayer(server.currentClientConnection, args);
  }

  // eslint-disable-next-line max-len
  async onEnterWorld(server: Server, {playerId}: Commands.EnterWorld['params']): Promise<Commands.EnterWorld['response']> {
    if (!server.currentClientConnection.account) throw new Error('Not logged in');
    if (server.currentClientConnection.player) throw new Error('Already in world');
    if (!server.currentClientConnection.account.playerIds.includes(playerId)) throw new Error('No such player');

    await server.playerEnterWorld(server.currentClientConnection, {
      playerId,
    });
  }

  onLogout(server: Server): Promise<Commands.Logout['response']> {
    server.removeClient(server.currentClientConnection);
    return Promise.resolve();
  }

  async onCastSpell(server: Server, {id, creatureId, loc}: Commands.CastSpell['params']): Promise<void> {
    const creature = server.currentClientConnection.creature;
    const otherCreature = creatureId ? server.context.getCreature(creatureId) : null;
    const spell = Content.getSpell(id);
    if (!spell) return Promise.reject('No such spell');

    let targetCreature;
    if (spell.target === 'other') {
      // `other` spells target the provided creatureId, else they target the currently targeted creature.
      const creatureState = server.creatureStates[server.currentClientConnection.creature.id];
      targetCreature = otherCreature || creatureState.targetCreature?.creature;
    } else {
      // `self` and `world` spells may only target the caster.
      targetCreature = creature;
    }

    if (spell.target === 'world' && !loc) {
      loc = otherCreature?.pos || targetCreature?.pos;
    }

    if (!targetCreature && !loc) {
      return Promise.reject('No target selected');
    }

    // Defer to creature state.
    if (spell.target === 'other' && targetCreature) {
      const state = server.creatureStates[server.currentClientConnection.creature.id];
      state.targetCreature = server.creatureStates[targetCreature.id];
      state.currentSpell = spell;
    } else {
      const failureReason = server.castSpell(spell, creature, targetCreature, loc);
      if (failureReason) return Promise.reject(failureReason);
    }

    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  async onRequestContainer(server: Server, {containerId, loc}: Commands.RequestContainer['params']): Promise<Commands.RequestContainer['response']> {
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
    server.reply(EventBuilder.container({container}));
  }

  // eslint-disable-next-line max-len
  onCloseContainer(server: Server, {containerId}: Commands.CloseContainer['params']): Promise<Commands.CloseContainer['response']> {
    const index = server.currentClientConnection.registeredContainers.indexOf(containerId);
    if (index !== -1) {
      server.currentClientConnection.registeredContainers.splice(index, 1);
    }
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onRequestCreature(server: Server, {id}: Commands.RequestCreature['params']): Promise<Commands.RequestCreature['response']> {
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
  onRequestPartition(server: Server, {w}: Commands.RequestPartition['params']): Promise<Commands.RequestPartition['response']> {
    const partition = server.context.map.getPartition(w);
    server.reply(EventBuilder.initializePartition({
      w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));
    return Promise.resolve();
  }

  async onRequestSector(server: Server, {...loc}: Commands.RequestSector['params']) {
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
  onCreatureAction(server: Server, {creatureId, type}: Commands.CreatureAction['params']): Promise<Commands.CreatureAction['response']> {
    const creature = server.context.getCreature(creatureId);
    const creatureState = server.creatureStates[creatureId];
    const isClose = true; // TODO
    if (!isClose) {
      return Promise.reject('Too far away');
    }

    if (!creature || creature.isPlayer) return Promise.reject('Cannot do that to another player');

    if (type === 'attack') {
      server.creatureStates[server.currentClientConnection.creature.id].targetCreature = creatureState;
      server.currentClientConnection.sendEvent(EventBuilder.setAttackTarget({creatureId}));
    }

    if (type === 'tame') {
      if (creature.tamedBy) return Promise.reject('Creature is already tamed');
      creature.tamedBy = server.currentClientConnection.player.id;
      server.broadcastPartialCreatureUpdate(creature, ['tamedBy']);
    }

    if (type === 'speak') {
      const dialogue =
        creatureState.onSpeakCallback && creatureState.onSpeakCallback(server.currentClientConnection, creature);
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
  onDialogueResponse(server: Server, {choiceIndex}: Commands.DialogueResponse['params']): Promise<Commands.DialogueResponse['response']> {
    server.processDialogueResponse(server.currentClientConnection, choiceIndex);
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onUse(server: Server, {toolIndex, location, usageIndex}: Commands.Use['params']): Promise<Commands.Use['response']> {
    if (location.source === 'container') {
      return Promise.reject(); // TODO
    }
    const loc = location.loc;

    if (!server.context.map.inBounds(loc)) {
      return Promise.reject(); // TODO
    }

    // TODO range check.

    const inventory = server.currentClientConnection.container;
    // If -1, use an item that represents "Hand".
    const tool = toolIndex === -1 ? {type: 0, quantity: 0} : inventory.items[toolIndex];
    // Got a request to use nothing as a tool - doesn't make sense to do that.
    if (!tool) return Promise.reject(); // TODO

    const focus = server.context.map.getItem(loc) || {type: 0, quantity: 0};

    const uses = Content.getItemUses(tool.type, focus.type);
    if (!uses.length) return Promise.reject(); // TODO
    const use = uses[usageIndex || 0];

    // TODO: use.skill should be a skill id
    const skill = use.skill && Content.getSkillByName(use.skill);
    if (skill && !server.currentClientConnection.player.skills.has(skill.id)) {
      return Promise.reject('missing required skill: ' + skill.name);
    }

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
      server.broadcastAnimation({
        name: use.animation,
        path: [loc],
      });
    }

    if (use.successFloor) {
      server.setFloor(loc, use.successFloor);
    }

    const focusMeta = Content.getMetaItem(focus.type);
    if (focusMeta.name === 'Life Stone' || focusMeta.name === 'Attune Warp Stone') {
      const distance = Utils.maxDiff(location.loc, server.currentClientConnection.creature.pos);
      if (distance > 1) {
        // TODO replace these with new Error() ...
        return Promise.reject('too far away');
      }

      server.broadcastAnimation({
        name: 'LevelUp',
        path: [server.currentClientConnection.creature.pos],
      });
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You will respawn here',
      }));
      server.currentClientConnection.player.spawnLoc = server.currentClientConnection.creature.pos;
    }

    if (skill && use.skillSuccessXp) {
      server.grantXp(server.currentClientConnection, skill.id, use.skillSuccessXp);
    }

    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onAdminSetFloor(server: Server, {floor, ...loc}: Commands.AdminSetFloor['params']): Promise<Commands.AdminSetFloor['response']> {
    server.setFloor(loc, floor);
    return Promise.resolve();
  }

  // eslint-disable-next-line max-len
  onAdminSetItem(server: Server, {item, ...loc}: Commands.AdminSetItem['params']): Promise<Commands.AdminSetItem['response']> {
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
  async onMoveItem(server: Server, {from, quantity, to}: Commands.MoveItem['params']) {
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
        return {error: 'Container does not exist.'};
      }

      if (container.type === 'equipment') {
        const meta = Content.getMetaItem(item.type);
        const requiredSkill = meta.combatSkill;
        if (requiredSkill && !server.currentClientConnection.player.skills.has(requiredSkill)) {
          return {
            error: `Missing ${Content.getSkill(requiredSkill).name} skill`,
          };
        }

        if (meta.equipSlot === 'Ammo') {
          const weaponItem = container.items[Container.EQUIP_SLOTS.Weapon];
          const weaponMeta = weaponItem && Content.getMetaItem(weaponItem.type);
          if (weaponMeta && weaponMeta.ammoType !== meta.ammoType) {
            return {
              error: 'Wrong ammo type for weapon',
            };
          }
        }
      }

      if (location.index === undefined) {
        // Don't allow stacking if this is an item split operation.
        const allowStacking = quantity === undefined;
        return Container.findValidLocationToAddItemToContainer(container, item, {allowStacking}) || {
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
        to = {source: 'container', id: server.context.getContainerIdFromItem(itemInWorld)};
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

    const fromOwner = from.source === 'world' && server.getSectorOwner(from.loc);
    if (fromOwner && fromOwner !== server.currentClientConnection.player.id) {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You cannot move items on land owned by someone else',
      }));
      return;
    }

    const toOwner = to.source === 'world' && server.getSectorOwner(to.loc);
    if (toOwner && toOwner !== server.currentClientConnection.player.id) {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You cannot put items on land owned by someone else',
      }));
      return;
    }

    if (!server.currentClientConnection.player.isAdmin && !Content.getMetaItem(fromItem.type).moveable) {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'That item is not moveable',
      }));
      return;
    }

    if (toItem && !Content.getMetaItem(fromItem.type).stackable) {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'That item is not stackable',
      }));
      return;
    }

    // TODO: temporary code until not everyone is an admin.
    if (Content.getMetaItem(fromItem.type).trapEffect === 'Warp') {
      server.reply(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'Dont touch that.',
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
      setItem(from, {...fromItem, quantity: fromItem.quantity - quantityToMove});
    }

    // TODO queue changes and send to all clients.
    // context.queueTileChange(from)
    // context.queueTileChange(to)
  }

  onLearnSkill(server: Server, {id}: { id: number }): Promise<void> {
    const skill = Content.getSkill(id);
    if (server.currentClientConnection.player.skillPoints < skill.skillPoints) {
      return Promise.reject('not enough skill points');
    }
    if (server.currentClientConnection.player.skills.get(id)) {
      return Promise.reject('you already know that skill');
    }

    Player.learnSkill(server.currentClientConnection.player, id);
    server.currentClientConnection.player.skillPoints -= skill.skillPoints;
    server.updateClientPlayer(server.currentClientConnection);

    return Promise.resolve();
  }

  onRequestScripts(server: Server): Promise<Array<{ id: string; config: any; errors: any[] }>> {
    return Promise.resolve(server.getScriptStates());
  }

  onChat(server: Server, {text}: Commands.Chat['params']): Promise<Commands.Chat['response']> {
    if (text.startsWith('/')) {
      const creature = server.currentClientConnection.creature;
      const parsedCommand = CommandParser.parseCommand(text.substring(1));

      const COMMANDS: Record<string, CommandParser.Command> = {
        warp: {
          args: [
            {name: 'x', type: 'number'},
            {name: 'y', type: 'number'},
            {name: 'z', type: 'number', optional: true},
            {name: 'map', type: 'number', optional: true},
          ],
          do(args: { x: number; y: number; z?: number; map?: number }) {
            const destination = {...server.currentClientConnection.creature.pos};
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
        warpTo: {
          args: [
            {name: 'playerName', type: 'string'},
          ],
          do(args: { playerName: string }) {
            const playerId = server.context.playerNamesToIds.get(args.playerName);
            if (!playerId) return; // TODO
            const player = server.context.players.get(playerId);
            if (!player) return;

            const creature2 = server.findCreatureForPlayer(player);
            if (!creature2) return;

            const loc = server.findNearest(creature2.pos, 10, false, (_, l) => server.context.walkable(l));
            if (!loc) return;

            server.warpCreature(creature, loc);
          },
        },
        creature: {
          args: [
            {name: 'name', type: 'string'},
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
              server.createCreature({type: template.id}, loc);
            }
          },
        },
        item: {
          args: [
            {name: 'nameOrId', type: 'string'},
            {name: 'quantity', type: 'number', optional: true},
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
              server.setItem(loc, {type: meta.id, quantity});
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
        landClaim: {
          args: [
            {name: 'server', type: 'boolean', optional: true},
          ],
          do(args: { server?: boolean }) {
            if (args.server && !server.currentClientConnection.player.isAdmin) return 'not allowed';

            const sectorPoint = Utils.worldToSector(creature.pos, SECTOR_SIZE);
            const id = args.server ? 'SERVER' : server.currentClientConnection.player.id;
            return server.claimSector(id, creature.pos.w, sectorPoint)?.error;
          },
        },
        landUnclaim: {
          args: [],
          do() {
            const id = server.getSectorOwner(creature.pos);
            if (!id) return 'land is not claimed';

            if (id === 'SERVER') {
              if (!server.currentClientConnection.player.isAdmin) return 'not allowed';
            } else {
              if (id !== server.currentClientConnection.player.id) return 'not allowed';
            }

            const sectorPoint = Utils.worldToSector(creature.pos, SECTOR_SIZE);
            server.claimSector('', creature.pos.w, sectorPoint);
          },
        },
        landOwner: {
          args: [],
          do() {
            const id = server.getSectorOwner(creature.pos);
            if (!id) {
              server.currentClientConnection.sendEvent(EventBuilder.chat({
                section: 'World',
                from: 'World',
                text: 'Unclaimed',
              }));
              return;
            }

            const player = server.context.players.get(id);
            server.currentClientConnection.sendEvent(EventBuilder.chat({
              section: 'World',
              from: 'World',
              text: player?.name || id,
            }));
          },
        },
        newPartition: {
          args: [],
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
            {name: 'ticks', type: 'number'},
          ],
          help: `1 hour=${server.ticksPerWorldDay / 24}`,
          do(args: { ticks: number }) {
            server.advanceTime(args.ticks);
          },
        },
        save: {
          args: [],
          do() {
            server.save().then(() => {
              server.currentClientConnection.sendEvent(EventBuilder.chat({
                section: 'World',
                from: 'World',
                text: 'Server saved.',
              }));
            });
          },
        },
        image: {
          args: [
            {name: 'index', type: 'number'},
            {name: 'file', type: 'string', optional: true},
            {name: 'type', type: 'number', optional: true},
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
            {name: 'skillName', type: 'string'},
            {name: 'xp', type: 'number'},
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
            {name: 'name', type: 'string'},
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

            server.broadcastAnimation({
              name: args.name,
              path: [server.currentClientConnection.creature.pos],
            });
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
      // TODO: return Error instead ?
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
