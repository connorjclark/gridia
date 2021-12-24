/* eslint-disable max-len */

import {MAX_STACK, MINE, SECTOR_SIZE, WATER} from '../constants.js';
import * as Container from '../container.js';
import * as Content from '../content.js';
import * as Player from '../player.js';
import {ClientConnection} from '../server/client-connection.js';
import {attributeCheck} from '../server/creature-utils.js';
import {Server} from '../server/server.js';
import * as Utils from '../utils.js';

import {processChatCommand} from './chat-commands.js';
import * as EventBuilder from './event-builder.js';
import {ICommands} from './gen/server-interface.js';

import Commands = Protocol.Commands;

export class ServerInterface implements ICommands {
  onMove(server: Server, clientConnection: ClientConnection, {...loc}: Commands.Move['params']): Promise<Commands.Move['response']> {
    if (!server.context.map.inBounds(loc)) {
      return Promise.reject('out of bounds');
    }

    const creature = clientConnection.creature;
    const tile = server.context.map.getTile(loc);

    if (tile.item?.type === MINE) {
      const player = clientConnection.player;
      const miningSkill = Content.getSkillByName('Mining');
      if (!miningSkill) return Promise.reject('no mining skill');
      if (!clientConnection.player.isAdmin) {
        if (!miningSkill || !player.skills.has(miningSkill.id)) return Promise.reject('need mining skill');
      }

      const container = clientConnection.container;
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
      server.grantXp(clientConnection, miningSkill.id, 10);
    }

    if (!server.context.walkable(loc)) return Promise.reject('not walkable');

    // TODO: generalize
    if (tile.floor === WATER && Content.getBaseDir() === 'worlds/rpgwo-world') {
      const isRaft = (item?: Item) => item && Content.getMetaItem(item.type).class === 'Raft';
      const itemBelowPlayer = server.context.map.getItem(clientConnection.creature.pos);
      const itemBelowPlayerDest = server.context.map.getItem(loc);
      const isOnRaft = isRaft(itemBelowPlayer) || isRaft(itemBelowPlayerDest);

      if (isRaft(itemBelowPlayer) && !server.context.map.getItem(loc)) {
        server.setItem(clientConnection.creature.pos, undefined);
        server.setItem(loc, itemBelowPlayer);
      }

      if (!isOnRaft) {
        server.creatureStates[creature.id].resetRegenerationTimer(server);
        if (attributeCheck(creature, 'stamina', 1)) {
          server.modifyCreatureStamina(null, creature, -2);
        } else {
          server.modifyCreatureLife(null, creature, -2);
        }
      }
    }

    server.scriptDelegates.onPlayerMove({clientConnection, from: creature.pos, to: loc});

    // if (!server.inView(loc)) {
    //   return false
    // }

    server.moveCreature(creature, {...loc});

    return Promise.resolve();
  }

  async onRegisterAccount(server: Server, clientConnection: ClientConnection, {firebaseToken}: Commands.RegisterAccount['params']): Promise<Commands.RegisterAccount['response']> {
    if (clientConnection.account) return Promise.reject('Already logged in');

    if (process.env.GRIDIA_EXECUTION_ENV === 'browser') {
      throw new Error('should not use firebase locally');
    }

    // TODO: do not include firebase-admin in worker server.
    const firebaseAdmin = (await import('firebase-admin')).default;
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(firebaseToken, true);
    const id = decodedToken.uid;

    await server.registerAccount(clientConnection, {
      id,
    });
  }

  async onLogin(server: Server, clientConnection: ClientConnection, {firebaseToken}: Commands.Login['params']): Promise<Commands.Login['response']> {
    if (clientConnection.account) throw new Error('Already logged in');

    let account: GridiaAccount;
    if (process.env.GRIDIA_EXECUTION_ENV === 'browser') {
      if (firebaseToken !== 'local') throw new Error('expected token: local');

      // Create account if not already made.
      try {
        await server.registerAccount(clientConnection, {
          id: 'local',
        });
      } catch {
        // ...
      }
      account = await server.loginAccount(clientConnection, {
        id: 'local',
      });
    } else {
      // TODO: do not include firebase-admin in worker server.
      const firebaseAdmin = (await import('firebase-admin')).default;
      const decodedToken = await firebaseAdmin.auth().verifyIdToken(firebaseToken, true);

      // Account data is saved on the filesystem, which is frequently cleared since
      // the game is under heavy development. For now, just remake an account for this
      // firebase id when needed.
      if (!await server.context.accountExists(decodedToken.uid)) {
        await server.registerAccount(clientConnection, {id: decodedToken.uid});
      }

      account = await server.loginAccount(clientConnection, {
        id: decodedToken.uid,
      });
    }

    const players = [];
    const graphics: Graphics[] = [];
    const equipmentGraphics = [];
    for (const playerId of account.playerIds) {
      const player = await server.context.getPlayer(playerId);
      if (!player) continue;

      const equipment = await server.context.getContainer(player.equipmentContainerId);
      if (!equipment) continue;

      players.push(player);
      // TODO: should save graphics to Player.
      // graphics.push(...);
      equipmentGraphics.push(server.makeCreatureImageData(equipment.items));
    }

    // No real reason to keep this secret, but the client never needs to know this id.
    account = {...account, id: '<removed>'};
    return {worldData: server.context.worldDataDefinition, account, players, graphics, equipmentGraphics};
  }

  onCreatePlayer(server: Server, clientConnection: ClientConnection, args: Commands.CreatePlayer['params']): Promise<void> {
    return server.createPlayer(clientConnection, args);
  }

  async onEnterWorld(server: Server, clientConnection: ClientConnection, {playerId}: Commands.EnterWorld['params']): Promise<Commands.EnterWorld['response']> {
    if (!clientConnection.account) throw new Error('Not logged in');
    if (clientConnection.player) throw new Error('Already in world');
    if (!clientConnection.account.playerIds.includes(playerId)) throw new Error('No such player');

    await server.playerEnterWorld(clientConnection, {
      playerId,
    });
  }

  onLogout(server: Server, clientConnection: ClientConnection): Promise<Commands.Logout['response']> {
    server.removeClient(clientConnection);
    return Promise.resolve();
  }

  async onCastSpell(server: Server, clientConnection: ClientConnection, {id, creatureId, loc}: Commands.CastSpell['params']): Promise<void> {
    const creature = clientConnection.creature;
    const otherCreature = creatureId ? server.context.getCreature(creatureId) : null;
    const spell = Content.getSpell(id);
    if (!spell) return Promise.reject('No such spell');

    let targetCreature;
    if (spell.target === 'other') {
      // `other` spells target the provided creatureId, else they target the currently targeted creature.
      const creatureState = server.creatureStates[clientConnection.creature.id];
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
      const state = server.creatureStates[clientConnection.creature.id];
      state.targetCreature = server.creatureStates[targetCreature.id];
      state.currentSpell = spell;
    } else {
      const failureReason = server.castSpell(spell, creature, targetCreature, loc);
      if (failureReason) return Promise.reject(failureReason);
    }

    return Promise.resolve();
  }

  async onRequestContainer(server: Server, clientConnection: ClientConnection, {containerId, loc}: Commands.RequestContainer['params']): Promise<Commands.RequestContainer['response']> {
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

    clientConnection.registeredContainers.push(containerId);
    const container = await server.context.getContainer(containerId);
    server.send(EventBuilder.container({container}), clientConnection);
  }

  onCloseContainer(server: Server, clientConnection: ClientConnection, {containerId}: Commands.CloseContainer['params']): Promise<Commands.CloseContainer['response']> {
    const index = clientConnection.registeredContainers.indexOf(containerId);
    if (index !== -1) {
      clientConnection.registeredContainers.splice(index, 1);
    }
    return Promise.resolve();
  }

  onRequestCreature(server: Server, clientConnection: ClientConnection, {id}: Commands.RequestCreature['params']): Promise<Commands.RequestCreature['response']> {
    const creature = server.context.getCreature(id);
    if (!creature) {
      return Promise.reject('requested invalid creature: ' + id);
    }

    server.send(EventBuilder.setCreature({
      partial: false,
      ...creature,
    }), clientConnection);
    return Promise.resolve();
  }

  onRequestPartition(server: Server, clientConnection: ClientConnection, {w}: Commands.RequestPartition['params']): Promise<Commands.RequestPartition['response']> {
    const partition = server.context.map.getPartition(w);
    server.send(EventBuilder.initializePartition({
      w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }), clientConnection);
    return Promise.resolve();
  }

  async onRequestSector(server: Server, clientConnection: ClientConnection, {...loc}: Commands.RequestSector['params']) {
    const isClose = true; // TODO
    if (loc.x < 0 || loc.y < 0 || loc.z < 0 || !isClose) {
      return;
    }

    const tiles: Tile[][] = JSON.parse(JSON.stringify(await server.ensureSectorLoaded(loc)));
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < tiles.length; i++) {
      for (let j = 0; j < tiles[0].length; j++) {
        const tile = tiles[i][j];
        delete tile.item?.oreType;
        delete tile.item?.textContent;
      }
    }

    server.send(EventBuilder.sector({
      ...loc,
      tiles,
    }), clientConnection);
  }

  onCreatureAction(server: Server, clientConnection: ClientConnection, {creatureId, type}: Commands.CreatureAction['params']): Promise<Commands.CreatureAction['response']> {
    if (type === 'attack' && creatureId === 0) {
      server.creatureStates[clientConnection.creature.id].targetCreature = null;
      clientConnection.sendEvent(EventBuilder.setAttackTarget({creatureId: null}));
      return Promise.resolve();
    }

    const creature = server.context.getCreature(creatureId);
    const creatureState = server.creatureStates[creatureId];
    const isClose = true; // TODO
    if (!isClose) {
      return Promise.reject('Too far away');
    }

    if (!creature) return Promise.reject('Cannot find creature');
    if (creature.isPlayer) return Promise.reject('Cannot do that to another player');

    if (type === 'attack') {
      server.creatureStates[clientConnection.creature.id].targetCreature = creatureState;
      clientConnection.sendEvent(EventBuilder.setAttackTarget({creatureId}));
    }

    if (type === 'tame') {
      if (creature.tamedBy) return Promise.reject('Creature is already tamed');
      creature.tamedBy = clientConnection.player.id;
      server.broadcastPartialCreatureUpdate(creature, ['tamedBy']);
    }

    if (type === 'speak') {
      const dialogue =
        creatureState.onSpeakCallback && creatureState.onSpeakCallback(clientConnection, creature);
      if (dialogue) {
        server.startDialogue(clientConnection, dialogue);
      } else {
        server.send(EventBuilder.chat({
          section: 'World',
          from: creature.name,
          creatureId: creature.id,
          text: '...',
        }), clientConnection);
      }
    }

    return Promise.resolve();
  }

  onDialogueResponse(server: Server, clientConnection: ClientConnection, {choiceIndex}: Commands.DialogueResponse['params']): Promise<Commands.DialogueResponse['response']> {
    server.processDialogueResponse(clientConnection, choiceIndex);
    return Promise.resolve();
  }

  onUse(server: Server, clientConnection: ClientConnection, {toolIndex, location, usageIndex}: Commands.Use['params']): Promise<Commands.Use['response']> {
    if (location.source === 'container') {
      return Promise.reject(); // TODO
    }
    const loc = location.loc;

    if (!server.context.map.inBounds(loc)) {
      return Promise.reject(); // TODO
    }

    // TODO range check.

    const inventory = clientConnection.container;
    // If -1, use an item that represents "Hand".
    const tool = toolIndex === -1 ? {type: 0, quantity: 0} : inventory.items[toolIndex];
    // Got a request to use nothing as a tool - doesn't make sense to do that.
    if (!tool) return Promise.reject(); // TODO

    const focus = server.context.map.getItem(loc) || {type: 0, quantity: 0};

    const uses = Content.getItemUses(tool.type, focus.type);
    if (!uses.length) return Promise.reject(); // TODO
    const use = uses[usageIndex || 0];

    const skill = use.skillId && Content.getSkill(use.skillId);
    if (!clientConnection.player.isAdmin) {
      if (skill && !clientConnection.player.skills.has(skill.id)) {
        throw new Error('missing required skill: ' + skill.name);
      }

      if (use.minimumSkillLevel !== undefined) {
        const minLevel = use.minimumSkillLevel;
        const maxLevel = use.minimumSkillLevel || minLevel;
        const successRate = Math.min(0.01, minLevel / maxLevel);
        if (Math.random() <= successRate) {
          return Promise.reject('You fumble it!');
        }
      }
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
      const distance = Utils.maxDiff(location.loc, clientConnection.creature.pos);
      if (distance > 1) {
        // TODO replace these with new Error() ...
        return Promise.reject('too far away');
      }

      server.broadcastAnimation({
        name: 'LevelUp',
        path: [clientConnection.creature.pos],
      });
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You will respawn here',
      }), clientConnection);
      clientConnection.player.spawnLoc = clientConnection.creature.pos;
    }

    if (skill && use.skillSuccessXp) {
      server.grantXp(clientConnection, skill.id, use.skillSuccessXp);
    }

    return Promise.resolve();
  }

  onAdminSetFloor(server: Server, clientConnection: ClientConnection, {floor, ...loc}: Commands.AdminSetFloor['params']): Promise<Commands.AdminSetFloor['response']> {
    server.setFloor(loc, floor);
    return Promise.resolve();
  }

  onAdminSetItem(server: Server, clientConnection: ClientConnection, {item, ...loc}: Commands.AdminSetItem['params']): Promise<Commands.AdminSetItem['response']> {
    if (!clientConnection.player.isAdmin) return Promise.reject(); // TODO

    if (!server.context.map.inBounds(loc)) {
      return Promise.reject(); // TODO
    }

    server.setItem(loc, item);
    return Promise.resolve();
  }

  // moveItem handles movement between anywhere items can be - from the world to a player's
  // container, within a container, from a container to the world, or even between containers.
  // If "to" is null for a container, no location is specified and the item will be place in the first viable slot.
  async onMoveItem(server: Server, clientConnection: ClientConnection, {from, quantity, to}: Commands.MoveItem['params']) {
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
        if (requiredSkill && !clientConnection.player.skills.has(requiredSkill)) {
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
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: validToLocation.error,
      }), clientConnection);
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
    if (fromOwner && fromOwner !== clientConnection.player.id) {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You cannot move items on land owned by someone else',
      }), clientConnection);
      return;
    }

    const toOwner = to.source === 'world' && server.getSectorOwner(to.loc);
    if (toOwner && toOwner !== clientConnection.player.id) {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You cannot put items on land owned by someone else',
      }), clientConnection);
      return;
    }

    if (!clientConnection.player.isAdmin && !Content.getMetaItem(fromItem.type).moveable) {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'That item is not moveable',
      }), clientConnection);
      return;
    }

    if (toItem && !Content.getMetaItem(fromItem.type).stackable) {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'That item is not stackable',
      }), clientConnection);
      return;
    }

    // TODO: temporary code until not everyone is an admin.
    if (Content.getMetaItem(fromItem.type).trapEffect === 'Warp') {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'Dont touch that.',
      }), clientConnection);
      return;
    }

    // Prevent container-ception.
    if (Content.getMetaItem(fromItem.type).class === 'Container' && to.source === 'container'
      && to.id === fromItem.containerId) {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'You cannot store a container inside another container',
      }), clientConnection);
      return;
    }

    const isStackable = Content.getMetaItem(fromItem.type).stackable && fromItem.type === toItem?.type;
    const quantityToMove = quantity !== undefined ? quantity : fromItem.quantity;

    if (isStackable && quantityToMove + (toItem?.quantity || 0) > MAX_STACK) {
      server.send(EventBuilder.chat({
        section: 'World',
        from: 'World',
        text: 'Item stack would be too large.',
      }), clientConnection);
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

  onLearnSkill(server: Server, clientConnection: ClientConnection, {id}: { id: number }): Promise<void> {
    const skill = Content.getSkill(id);
    if (clientConnection.player.skillPoints < skill.skillPoints) {
      return Promise.reject('not enough skill points');
    }
    if (clientConnection.player.skills.get(id)) {
      return Promise.reject('you already know that skill');
    }

    Player.learnSkill(clientConnection.player, id);
    clientConnection.player.skillPoints -= skill.skillPoints;
    server.updateClientPlayer(clientConnection);

    return Promise.resolve();
  }

  onRequestScripts(server: Server): Promise<Array<{ id: string; config: any; errors: any[] }>> {
    return Promise.resolve(server.getScriptStates());
  }

  async onChat(server: Server, clientConnection: ClientConnection, {text}: Commands.Chat['params']): Promise<Commands.Chat['response']> {
    if (text.startsWith('/')) {
      await processChatCommand(server, clientConnection, text);
    } else {
      server.broadcastChat({
        from: clientConnection.player.name,
        creatureId: clientConnection.creature.id,
        text,
      });
    }
  }

  onReadItem(server: Server, clientConnection: ClientConnection, {location}: { location: ItemLocation }): Promise<{ content: string }> {
    const item = location.source === 'world' ? server.context.map.getItem(location.loc) : undefined;
    if (!item || !Content.getMetaItem(item.type).readable) return Promise.reject('invalid item');

    return Promise.resolve({
      content: item.textContent || 'It\'s blank.',
    });
  }

  async onSaveSettings(server: Server, clientConnection: ClientConnection, {settings}: { settings: Settings }): Promise<void> {
    clientConnection.account.settings = settings;
    await server.context.saveAccount(clientConnection.account);
  }
}
