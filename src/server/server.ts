import {MAX_STACK, SECTOR_SIZE} from '../constants.js';
import * as Container from '../container.js';
import * as Content from '../content.js';
import {calcStraightLine} from '../lib/line.js';
import {roll} from '../lib/loot-table.js';
import {sniffObject} from '../lib/sniff-object.js';
import * as Player from '../player.js';
import * as EventBuilder from '../protocol/event-builder.js';
import {ProtocolEvent} from '../protocol/event-builder.js';
import {InvalidProtocolError, ServerInterface} from '../protocol/server-interface.js';
import * as Utils from '../utils.js';
import {WorldMapPartition} from '../world-map-partition.js';

import {ClientConnection, PlayerConnection} from './client-connection.js';
import {CreatureState} from './creature-state.js';
import {adjustAttribute, attributeCheck} from './creature-utils.js';
import * as Load from './load-data.js';
import {ScriptManager} from './script-manager.js';
import {ServerContext} from './server-context.js';
import {TaskRunner} from './task-runner.js';

// TODO document how the f this works.

interface CtorOpts {
  context: ServerContext;
  verbose: boolean;
}

interface RegisterAccountOpts {
  id: string;
}

interface AttackData {
  actor: Creature;
  damage: number;
  canBeBlocked: boolean;
  attackAttributeCost: number;
  attackSkill: Skill;
  weapon?: Item;
  spell?: Spell;
  minRange: number;
  maxRange: number;
  lineOfSight: boolean;
  target: Creature;
  defenseSkill: Skill;
  successAnimationName?: string;
  projectileAnimationName?: string;
}

export class Server {
  context: ServerContext;
  outboundMessages = [] as Array<{
    message: Message;
    to?: ClientConnection;
    filter?: (playerConnection: PlayerConnection) => boolean;
  }>;
  pendingCreatureSniffedOperations: Map<number, SniffedOperation[]> = new Map();
  pendingPlayerSniffedOperations: Map<Player, SniffedOperation[]> = new Map();
  pendingSectorSniffedOperations: Map<Sector, {pos: TilePoint; ops: SniffedOperation[]}> = new Map();
  pendingContainerSniffedOperations: Map<Container, SniffedOperation[]> = new Map();
  // TODO: WeakMap
  creatureStates: Record<number, CreatureState> = {};

  verbose: boolean;
  taskRunner = new TaskRunner(50);
  scriptManager = new ScriptManager(this);

  private _serverInterface = new ServerInterface();
  private _quests: Quest[] = [];

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
    this.setupTickSections();

    const originalLoader = this.context.map.loader;
    if (!originalLoader) throw new Error('must set context.map.loader');
    this.context.map.loader = async (pos) => {
      const sector = await originalLoader(pos);

      return sniffObject(sector, (op) => {
        if (op.path.includes('._')) return;

        if (typeof op.value === 'object' && op.value !== null) {
          const keysToDelete = [];
          for (const key of Object.keys(op.value)) {
            if (key.startsWith('_')) keysToDelete.push(key);
          }
          if (keysToDelete.length) {
            op.value = {...op.value};
            for (const key of keysToDelete) delete op.value[key];
          }
        }

        const entry = this.pendingSectorSniffedOperations.get(sector) || {pos, ops: []};
        entry.ops.push(op);
        this.pendingSectorSniffedOperations.set(sector, entry);
      });
    };
  }

  addClientConnection(clientConnection: ClientConnection) {
    this.context.clientConnections.push(clientConnection);
  }

  broadcast(event: ProtocolEvent) {
    const message = {data: event};
    this.outboundMessages.push({message});
  }

  send(event: ProtocolEvent, toClient: ClientConnection) {
    const message = {data: event};
    this.outboundMessages.push({to: toClient, message});
  }

  conditionalBroadcast(event: ProtocolEvent, filter: (playerConnection: PlayerConnection) => boolean) {
    const message = {data: event};
    this.outboundMessages.push({filter, message});
  }

  broadcastInRange(event: ProtocolEvent, pos: TilePoint, range: number) {
    this.conditionalBroadcast(event, (client) => {
      const pos2 = client.creature.pos;
      if (pos2.z !== pos.z || pos2.w !== pos.w) return false;

      return Utils.dist(pos, pos2) <= range;
    });
  }

  broadcastInRangeExceptFor(event: ProtocolEvent, pos: TilePoint, range: number, playerConnection: PlayerConnection) {
    this.conditionalBroadcast(event, (client) => {
      if (client === playerConnection) return false;

      const pos2 = client.creature.pos;
      if (pos2.z !== pos.z || pos2.w !== pos.w) return false;

      return Utils.dist(pos, pos2) <= range;
    });
  }

  broadcastAnimation(animationInstance: GridiaAnimationInstance) {
    this.broadcastInRange(EventBuilder.animation({...animationInstance}), animationInstance.path[0], 30);
  }

  broadcastChat(opts: { from: string; creatureId?: number; text: string }) {
    if (!process.env.GRIDIA_TEST) console.log(`${opts.from}: ${opts.text}`);
    this.broadcast(EventBuilder.chat({
      section: 'Global',
      from: opts.from,
      creatureId: opts.creatureId,
      text: opts.text,
    }));
  }

  broadcastChatFromServer(message: string) {
    this.broadcastChat({from: 'SERVER', text: message});
  }

  start() {
    console.log('Server started.');
    this.taskRunner.start();
  }

  async stop() {
    this.taskRunner.stop();
    await this.scriptManager.stop();
  }

  save() {
    return this.context.save();
  }

  registerQuest<T>(quest: Quest<T>) {
    if (quest.stages.length === 0) {
      throw new Error('invalid quest');
    }

    if (quest.stages[0] !== 'start') {
      throw new Error('first stage must be "start"');
    }

    if (quest.stages[quest.stages.length - 1] !== 'finish') {
      throw new Error('last stage must be "finish"');
    }

    if (new Set(quest.stages).size !== quest.stages.length) {
      throw new Error('stages must be unique');
    }

    this._quests.push(quest);
  }

  getQuest(id: string) {
    const quest = this._quests.find((q) => q.id === id);
    if (!quest) throw new Error(`unknown quest: ${id}`);
    return quest;
  }

  startDialogue(playerConnection: PlayerConnection, dialogueInstance: DialogueInstance) {
    // TODO instead of starting at index 0, find first part that passes all conditions
    playerConnection.activeDialogue = {dialogueInstance, partIndex: 0, partIndexStack: []};

    const symbols = playerConnection.player.dialougeSymbols.get(dialogueInstance.dialogue.id) || new Set();
    playerConnection.player.dialougeSymbols.set(dialogueInstance.dialogue.id, symbols);

    this.sendCurrentDialoguePart(playerConnection, symbols, true);
  }

  processDialogueResponse(playerConnection: PlayerConnection, choiceIndex?: number) {
    if (!playerConnection.activeDialogue) return;

    const {dialogueInstance, partIndex, partIndexStack} = playerConnection.activeDialogue;
    const dialogue = dialogueInstance.dialogue;
    const currentPart = dialogue.parts[partIndex];

    const symbols = playerConnection.player.dialougeSymbols.get(dialogue.id) || new Set();
    playerConnection.player.dialougeSymbols.set(dialogue.id, symbols);

    if (choiceIndex === undefined && currentPart.choices) {
      throw new Error('missing choice');
    }

    const checkConditions = (part: DialoguePart) => {
      if (part.annotations?.if && !symbols.has(part.annotations.if)) {
        return false;
      }

      if (part.annotations?.if_has_skill) {
        const skillId = Content.getSkillByName(part.annotations.if_has_skill)?.id;
        if (!skillId) throw new Error('invalid skill check');

        if (!Player.hasSkill(playerConnection.player, skillId)) return false;
      }

      return true;
    };

    let nextPartIndex;
    if (currentPart.annotations && 'return' in currentPart.annotations) {
      nextPartIndex = partIndexStack.pop();
    } else if (choiceIndex !== undefined) {
      if (!currentPart.choices || choiceIndex < 0 || choiceIndex >= currentPart.choices.length) {
        throw new Error('bad choice');
      }

      const choice = currentPart.choices[choiceIndex];
      if (choice.annotations.if && !symbols.has(choice.annotations.if)) {
        throw new Error('missing symbol');
      }

      nextPartIndex = Number(choice.annotations.goto);
      while (!checkConditions(dialogue.parts[nextPartIndex])) {
        nextPartIndex += 1;
      }

      partIndexStack.push(partIndex);
    } else if (partIndex + 1 < dialogue.parts.length) {
      nextPartIndex = partIndex + 1;
    } else {
      dialogueInstance.onFinish?.();
    }

    if (currentPart.annotations?.symbol) symbols.add(currentPart.annotations.symbol);

    if (currentPart.annotations?.item) {
      const item = {
        type: Content.getMetaItemByName(currentPart.annotations.item).id,
        quantity: Number(currentPart.annotations.item_quantity) || 1,
      };

      if (Container.addItemToContainer(this, playerConnection.container, item)) {
        playerConnection.sendEvent(EventBuilder.notification({
          details: {
            type: 'text',
            text: `You were given a ${currentPart.annotations.item}!`,
          },
        }));
      } else {
        // TODO ?
      }
    }

    if (nextPartIndex !== undefined) {
      playerConnection.activeDialogue.partIndex = nextPartIndex;
      this.sendCurrentDialoguePart(playerConnection, symbols, false);
    } else {
      playerConnection.activeDialogue = undefined;
      playerConnection.sendEvent(EventBuilder.updateDialogue({id: dialogue.id, index: -1, symbols: new Set()}));
    }
  }

  sendCurrentDialoguePart(playerConnection: PlayerConnection, symbols: Set<string>, start: boolean) {
    if (!playerConnection.activeDialogue) return;

    const {dialogueInstance, partIndex} = playerConnection.activeDialogue;

    if (start) {
      playerConnection.sendEvent(EventBuilder.startDialogue({
        speakers: dialogueInstance.speakers.map((speaker) => ({
          id: speaker.id,
          name: speaker.name,
        })),
        dialogue: dialogueInstance.dialogue,
        index: partIndex,
        symbols,
      }));
    } else {
      playerConnection.sendEvent(EventBuilder.updateDialogue({
        id: dialogueInstance.dialogue.id,
        index: partIndex,
        symbols,
      }));
    }
  }

  async registerAccount(clientConnection: ClientConnection, opts: RegisterAccountOpts) {
    if (await Load.accountExists(this.context, opts.id)) {
      throw new Error('Account with this id already exists');
    }

    const account: GridiaAccount = {
      id: opts.id,
      playerIds: [],
    };

    await Load.saveAccount(this.context, account);
  }

  async loginAccount(clientConnection: ClientConnection, opts: RegisterAccountOpts) {
    const account =
      await Load.accountExists(this.context, opts.id) && await Load.loadAccount(this.context, opts.id);
    if (!account) {
      throw new Error('Invalid login');
    }

    clientConnection.account = account;
    return account;
  }

  async getInitialSpawnLoc() {
    const {width, height} = this.context.map.getPartition(0);
    const center = {w: 0, x: Math.round(width / 2), y: Math.round(height / 2) + 3, z: 0};

    // TODO: is this still needed?
    // Make sure sector is loaded. Prevents hidden creature (race condition, happens often in worker).
    await this.ensureSectorLoadedForPoint(center);
    const spawnPos = this.findNearestWalkableTile({pos: center, range: 10}) || center;
    await this.ensureSectorLoadedForPoint(spawnPos);

    return spawnPos;
  }

  getInitialSpawnpos2() {
    const {width, height} = this.context.map.getPartition(0);
    const center = {w: 0, x: Math.round(width / 2), y: Math.round(height / 2) + 3, z: 0};
    const spawnPos = this.findNearestWalkableTile({pos: center, range: 10}) || center;
    return spawnPos;
  }

  async createPlayer(clientConnection: ClientConnection, opts: Protocol.Commands.CreatePlayer['params']) {
    if (!clientConnection.account) return Promise.reject('Not logged in');
    if (opts.name.length > 20) return Promise.reject('Name too long');
    if (opts.name.length <= 2) return Promise.reject('Name too short');
    if (opts.name.match(/\s{2,}/) || opts.name.trim() !== opts.name) return Promise.reject('Name has bad spacing');
    if (!opts.name.match(/^@?[A-ZÀ-ÚÄ-Ü 0-9]+$/i)) return Promise.reject('Name has illegal characters');

    if (this.context.playerNamesToIds.has(opts.name)) {
      return Promise.reject('Name already taken');
    }

    const characterCreation = this.context.worldDataDefinition.characterCreation;
    if (characterCreation.simple) {
      opts.attributes = new Map();

      const attributes = Content.getAttributes();
      for (const key of attributes) {
        opts.attributes.set(key, 0);
      }
      for (let i = 0; i < characterCreation.attributePoints; i++) {
        const key = attributes[i % attributes.length];
        opts.attributes.set(key, 1 + (opts.attributes.get(key) || 0));
      }

      opts.skills = new Map();
    }

    for (const id of characterCreation.requiredSkills || []) {
      if (!opts.skills.has(id)) opts.skills.set(id, 'learn');
    }

    if (!opts.attributes.size && opts.name === '@TestUser') {
      opts.attributes = new Map([
        ['life', characterCreation.attributePoints - 20],
        ['intelligence', 10],
        ['wisdom', 10],
      ]);
    }

    for (const attribute of opts.attributes.keys()) {
      const attr = characterCreation.attributes.find((a) => a.name === attribute);
      if (!attr) throw new Error('invalid attribute');
      if (attr.derived) console.trace(opts);
      if (attr.derived) throw new Error(`invalid attribute: ${attr.name} is derived`);
    }

    let attributeValueSum = 0;
    for (const value of opts.attributes.values()) attributeValueSum += value;
    if (attributeValueSum !== characterCreation.attributePoints) {
      throw new Error('Must use all attribute points');
    }

    let skillPointSum = 0;
    for (const [skillId, state] of opts.skills) {
      if (state === 'learn') {
        skillPointSum += Content.getSkill(skillId).skillPoints;
      } else {
        skillPointSum += 2 * Content.getSkill(skillId).skillPoints;
      }
    }
    if (skillPointSum > characterCreation.skillPoints) {
      throw new Error(`skill points can't be greater than ${characterCreation.skillPoints}`);
    }

    const pos = await this.getInitialSpawnLoc();
    const player: Player = {
      id: Utils.uuid(),
      name: opts.name,
      loggedIn: true,
      timePlayed: 0,
      lastLogin: Date.now(),
      lastSaved: 0,
      attributes: new Map(),
      skills: new Map(),
      specializedSkills: new Set(),
      skillPoints: characterCreation.skillPoints,
      questStates: new Map(),
      dialougeSymbols: new Map(),
      tilesSeenLog: new Map(),
      // anyone could be an admin, for now.
      isAdmin: opts.name.startsWith('@'),
      // set later
      containerId: '',
      // set later
      equipmentContainerId: '',
      pos,
      spawnPos: pos,
      // set later
      life: 0,
      // set later
      stamina: 0,
      // set later
      mana: 0,
      food: 300,
      buffs: [],
      tamedCreatureIds: new Set(),
    };

    for (const attribute of characterCreation.attributes) {
      let baseLevel;
      if (attribute.derived) {
        const multiplier = attribute.derived.creationMultiplier || 1;
        baseLevel = multiplier * (opts.attributes.get(attribute.derived.from) || 0);
      } else {
        baseLevel = opts.attributes.get(attribute.name) || 0;
      }

      player.attributes.set(attribute.name, {
        baseLevel,
        earnedLevel: 0,
      });
    }

    for (const [skillId, state] of opts.skills) {
      Player.learnSkill(player, skillId);
      if (state === 'specialize') {
        player.specializedSkills.add(skillId);
        player.skillPoints -= 2 * Content.getSkill(skillId).skillPoints;
      } else {
        player.skillPoints -= Content.getSkill(skillId).skillPoints;
      }
    }

    player.life = Player.getAttributeValue(player, 'life', player.buffs).level;
    player.stamina = Player.getAttributeValue(player, 'stamina', player.buffs).level;
    player.mana = Player.getAttributeValue(player, 'mana', player.buffs).level;

    const container = this.context.makeContainer('normal');
    player.containerId = container.id;

    const equipment = this.context.makeContainer('equipment', Object.keys(Container.EQUIP_SLOTS).length);
    player.equipmentContainerId = equipment.id;

    if (opts.name !== '@TestUser' && this.context.worldDataDefinition.baseDir === 'worlds/rpgwo-world') {
      container.items[0] = {type: Content.getMetaItemByName('Wood Axe').id, quantity: 1};
      container.items[1] = {type: Content.getMetaItemByName('Fire Starter').id, quantity: 1};
      container.items[2] = {type: Content.getMetaItemByName('Pick').id, quantity: 1};
      container.items[3] = {type: Content.getMetaItemByName('Plough').id, quantity: 1};
      container.items[4] = {type: Content.getMetaItemByName('Mana Plant Seeds').id, quantity: 100};
      container.items[5] = {type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1};
      container.items[6] = {type: Content.getMetaItemByName('Saw').id, quantity: 1};
      container.items[7] = {type: Content.getMetaItemByName('Hammer and Nails').id, quantity: 1};
      container.items[8] = {type: Content.getMetaItemByName('Lit Torch').id, quantity: 1};
      container.items[9] = {type: Content.getMetaItemByName('Wood Planks').id, quantity: 10};
      container.items[10] = {type: Content.getMetaItemByName('Bow').id, quantity: 1};
      container.items[11] = {type: Content.getMetaItemByName('Arrow').id, quantity: 500};
      container.items[12] = {type: Content.getMetaItemByName('Iron Wand').id, quantity: 1};
      container.items[13] = {type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1};

      equipment.items[0] = {type: Content.getMetaItemByName('Iron Helmet Plate').id, quantity: 1};
    }

    Load.savePlayer(this.context, player);
    await this.context.db.endTransaction();

    clientConnection.account.playerIds.push(player.id);
    await Load.saveAccount(this.context, clientConnection.account);

    this.context.playerNamesToIds.set(opts.name, player.id);

    await this.playerEnterWorld(clientConnection,
      {justCreated: true, player, playerId: player.id});
  }

  async playerEnterWorld(clientConnection: ClientConnection,
                         opts: { justCreated?: boolean; player?: Player; playerId: string }) {
    let player: Player;
    if (opts.player) {
      player = opts.player;
    } else {
      player = await this.context.getPlayer(opts.playerId);
    }

    clientConnection.container = await this.context.getContainer(player.containerId);
    clientConnection.equipment = await this.context.getContainer(player.equipmentContainerId);

    let creature: Creature = {
      id: this.context.nextCreatureId++,
      dead: false,
      isNPC: false,
      name: player.name,
      pos: {...player.pos},
      graphics: {
        file: 'rpgwo-player0.png',
        frames: [Utils.randInt(0, 3)],
      },
      isPlayer: true,
      // TODO
      speed: 2,
      life: {
        current: player.life,
        max: Player.getAttributeValue(player, 'life', player.buffs).level,
      },
      stamina: {
        current: player.stamina,
        max: Player.getAttributeValue(player, 'stamina', player.buffs).level,
      },
      mana: {
        current: player.mana,
        max: Player.getAttributeValue(player, 'mana', player.buffs).level,
      },
      food: player.food,
      eatGrass: false,
      light: 0,
      combatLevel: Player.getCombatLevel(player).combatLevel,
      // set later
      stats: {} as Creature['stats'],
      buffs: [...player.buffs],
    };

    if (this.context.worldDataDefinition.baseDir === 'worlds/16bit-world') {
      creature.graphics = {
        file: 'creatures_001.png', frames: [0, 18],
      };
    } else if (this.context.worldDataDefinition.baseDir === 'worlds/bit-world') {
      creature.graphics = {
        file: 'tileset_1bit_001.png', frames: [5 * 8 + 4],
      };
    } else if (this.context.worldDataDefinition.baseDir === 'worlds/urizen-world') {
      creature.graphics = {
        file: 'tileset.png', frames: [29],
      };
    }

    this.updateCreatureDataBasedOnEquipment(creature, clientConnection.equipment, {broadcast: false});
    creature = this.registerCreature(creature);
    clientConnection.creature = creature;

    for (const creatureId of player.tamedCreatureIds) {
      if (!this.context.creatures.has(creatureId)) player.tamedCreatureIds.delete(creatureId);
    }

    player.lastLogin = Date.now();

    clientConnection.player = player;
    clientConnection.assertsPlayerConnection();
    this.updateCreatureDataBasedOnInventory(clientConnection);

    await this.initClient(clientConnection);
    this.broadcastChatFromServer(`${clientConnection.player.name} has entered the world.`);
    player.loggedIn = true;

    const sniffedPlayer = sniffObject(player, (op) => {
      if (op.path === '.timePlayed') return;
      if (op.path.startsWith('.tilesSeenLog')) return;
      if (op.path.startsWith('.dialougeSymbols')) return;

      const ops = this.pendingPlayerSniffedOperations.get(player) || [];
      ops.push(op);
      this.pendingPlayerSniffedOperations.set(player, ops);
    });

    clientConnection.player = sniffedPlayer;
    this.context.players.set(player.id, sniffedPlayer);

    if (opts.justCreated) {
      await this.scriptManager.delegates.onPlayerCreated(sniffedPlayer, clientConnection);
    }
    await this.scriptManager.delegates.onPlayerEnterWorld(sniffedPlayer, clientConnection);
  }

  getClientConnectionForCreature(creature: Creature) {
    for (const clientConnection of this.context.clientConnections) {
      if (clientConnection.creature?.id === creature.id) return clientConnection.ensurePlayerConnection();
    }
  }

  getClientConnectionForPlayer(player: Player) {
    for (const clientConnection of this.context.clientConnections) {
      if (clientConnection.player?.id === player.id) return clientConnection.ensurePlayerConnection();
    }
  }

  removeClient(clientConnection: ClientConnection) {
    const index = this.context.clientConnections.indexOf(clientConnection);
    if (index === -1) return;

    this.context.clientConnections.splice(index, 1);
    if (clientConnection.isPlayerConnection()) {
      Load.savePlayer(this.context, clientConnection.player, clientConnection.creature);
      this.removeCreature(clientConnection.creature);
      this.broadcastAnimation({
        name: 'WarpOut',
        path: [clientConnection.creature.pos],
      });
      this.broadcastChatFromServer(`${clientConnection.player.name} has left the world.`);

      clientConnection.player.loggedIn = false;

      const clientConnectionBase = clientConnection as ClientConnection;
      clientConnectionBase.creature = undefined;
      clientConnectionBase.player = undefined;
      clientConnectionBase.container = undefined;
      clientConnectionBase.equipment = undefined;

      // Do not remove player from `this.context.players` yet, not until
      // the next server.save(), in case player logs back in before the next save.
    }
  }

  async consumeAllMessages() {
    while (
      this.pendingCreatureSniffedOperations.size ||
      this.pendingPlayerSniffedOperations.size ||
      this.pendingSectorSniffedOperations.size ||
      this.pendingContainerSniffedOperations.size ||
      this.outboundMessages.length ||
      this.context.clientConnections.some((c) => c.hasMessage())
    ) {
      await this.taskRunner.tick();
    }
  }

  createCreature(descriptor: CreatureDescriptor, pos: TilePoint): Creature | undefined {
    let template = Content.getMonsterTemplate(descriptor.type);
    if (!template) {
      console.error(`invalid monster template: ${descriptor.type}, falling back to default`);
      template = Content.getMonsterTemplate(1);
    }

    const life = template.life || 10;
    const stamina = template.stamina || 10;
    const mana = template.mana || 10;

    let creature: Creature = {
      id: this.context.nextCreatureId++,
      type: template.id,
      dead: false,
      isNPC: false,
      graphics: template.graphics,
      name: template.name,
      pos: this.findNearestWalkableTile({pos, range: 10}) || pos,
      isPlayer: false,
      roam: template.roam,
      speed: template.speed,
      life: {current: life, max: life},
      stamina: {current: stamina, max: stamina},
      mana: {current: mana, max: mana},
      food: 10,
      eatGrass: template.eatGrass,
      light: 0,
      equipment: template.equipment ? [...template.equipment] : undefined,
      // @ts-expect-error TODO
      combatLevel: template.level || 5,
      stats: {
        armor: 0,
        attackSpeed: template.speed,
        damageLow: 1,
        damageHigh: 1,
        meleeDefense: template.meleeDefense || 0,
        missleDefense: template.missleDefense || 0,
        magicDefense: template.magicDefense || 0,
      },
      buffs: [],
      magicLevel: template.magicLevel,
      magicChances: template.magicChances,
      tameable: template.tameable,
      ...descriptor.partial,
    };

    if (creature.equipment) {
      Object.assign(creature, this.deriveCreaturePropertiesFromEquipment(creature, creature.equipment));
      creature.stats.meleeDefense = template.meleeDefense || 0;
      creature.stats.missleDefense = template.missleDefense || 0;
      creature.stats.magicDefense = template.magicDefense || 0;
    }

    creature = this.registerCreature(creature);

    if (descriptor.onSpeak) {
      creature.canSpeak = true;
      this.creatureStates[creature.id].onSpeakCallback = descriptor.onSpeak;
    }

    if (creature.merchant || creature.canSpeak) {
      creature.isNPC = true;
    }

    return creature;
  }

  moveCreature(creature: Creature, pos: TilePoint) {
    const creatureState = this.creatureStates[creature.id];
    const tile = this.context.map.getTile(pos);
    const meta = tile.item && Content.getMetaItem(tile.item.type);

    if (tile.floor === Content.getWaterFloor()) {
      const isRaft = (item?: Item) => item && Content.getMetaItem(item.type).class === 'Raft';
      const itemBelowPlayer = this.context.map.getItem(creature.pos);
      const itemBelowPlayerDest = this.context.map.getItem(pos);
      const isOnRaft = isRaft(itemBelowPlayer) || isRaft(itemBelowPlayerDest);

      if (isRaft(itemBelowPlayer) && !this.context.map.getItem(pos)) {
        this.setItemInWorld(creature.pos, undefined);
        this.setItemInWorld(pos, itemBelowPlayer);
      }

      if (!isOnRaft) {
        this.creatureStates[creature.id].resetRegenerationTimer(this);
        if (attributeCheck(creature, 'stamina', 1)) {
          this.modifyCreatureStamina(null, creature, -2);
        } else {
          this.modifyCreatureLife(null, creature, -2);
        }
      }
    }

    if (meta?.standDamage) {
      this.modifyCreatureLife(null, creature, -meta.standDamage);
      this.broadcastAnimation({
        name: 'Attack',
        path: [pos],
      });
    }

    let warpToPos: Point4 | null = null;
    let playWarpSound = false;
    if (tile.item && meta && !creatureState.warped) {
      if (meta.class === 'CaveDown') {
        warpToPos = {...creature.pos, z: creature.pos.z + 1};
      } else if (meta.class === 'CaveUp') {
        warpToPos = {...creature.pos, z: creature.pos.z - 1};
      } else if (meta.trapEffect === 'Warp' && tile.item.warpTo) {
        warpToPos = {...tile.item.warpTo};
        playWarpSound = true;
      }
      if (warpToPos && !this.context.map.inBounds(warpToPos)) warpToPos = null;
    }

    if (!creature.dead) {
      if (warpToPos) {
        // Bit weird, but it works.
        new Promise((resolve) => setTimeout(resolve, 250)).then(() => {
          if (!creature.dead && Utils.equalPoints(creature.pos, pos) && warpToPos) {
            this.warpCreature(creature, warpToPos, {warpAnimation: playWarpSound});
          }
        });
      }

      if (creature.pos.w !== pos.w || creature.pos.z !== pos.z) {
        // Player has moved in an unusual way, probably by pressing T.
        // Disable warps so that player doesn't possibly get warped back.
        creatureState.warped = true;
      } else {
        // Player simply moved, warping is OK again.
        creatureState.warped = false;
      }

      creature.pos = pos;
    }
  }

  findPlayerForCreature(creature: Creature) {
    for (const clientConnection of this.context.clientConnections.values()) {
      if (clientConnection.creature === creature) return clientConnection.player;
    }
  }

  findCreatureForPlayer(player: Player) {
    for (const clientConnection of this.context.clientConnections.values()) {
      if (clientConnection.player === player) return clientConnection.creature;
    }
  }

  async warpCreature(creature: Creature, pos: TilePoint, opts: { warpAnimation: boolean }) {
    if (!this.context.map.inBounds(pos)) return;

    this.creatureStates[creature.id].warped = true;
    this.creatureStates[creature.id].path = [];

    if (opts.warpAnimation) {
      this.broadcastAnimation({
        name: 'WarpOut',
        path: [creature.pos],
      });
    }

    await this.ensureSectorLoadedForPoint(pos);
    // TODO: this could be abused ... instead, should make it possible for
    // multiple creatures to be in the same location.
    pos = this.findNearestWalkableTile({pos, range: 5}) || pos;
    this.moveCreature(creature, pos);

    if (opts.warpAnimation) {
      this.broadcastAnimation({
        name: 'WarpIn',
        path: [pos],
      });
    }
  }

  // TODO: rename
  handleAttack(data: AttackData) {
    // eslint-disable-next-line max-len
    let missReason: null | 'too-close' | 'too-far' | 'need-mana' | 'need-stamina' | 'need-ammo' | 'blocked' | 'obstructed' = null;
    const weaponMeta = data.weapon && Content.getMetaItem(data.weapon.type);
    const attackType = data.attackSkill.purpose || 'melee';
    const actorAttributesDelta: Record<string, number> = {
      life: 0,
      stamina: 0,
      mana: 0,
    };
    const targetAttributesDelta: Record<string, number> = {
      life: 0,
      stamina: 0,
      mana: 0,
    };

    // Range checks.
    const distanceFromTarget = Utils.maxDiff(data.actor.pos, data.target.pos);
    if (distanceFromTarget < data.minRange) {
      missReason = 'too-close';
    }
    if (distanceFromTarget > data.maxRange) {
      missReason = 'too-far';
    }
    if (data.actor.pos.w !== data.target.pos.w) missReason = 'too-far';
    if (data.actor.pos.z !== data.target.pos.z) missReason = 'too-far';

    if (!missReason && data.attackAttributeCost) {
      if (attackType === 'magic') {
        if (attributeCheck(data.actor, 'mana', data.attackAttributeCost)) {
          actorAttributesDelta.mana = -data.attackAttributeCost;
        } else {
          missReason = 'need-mana';
        }
      } else {
        if (attributeCheck(data.actor, 'stamina', data.attackAttributeCost)) {
          actorAttributesDelta.stamina = -data.attackAttributeCost;
        } else {
          missReason = 'need-stamina';
        }
      }
    }

    if (!missReason) {
      let hasAmmoForAttack = true;
      if (weaponMeta && attackType === 'missle' && data.actor.isPlayer) {
        const ammoTypeNeeded = weaponMeta.ammoType;
        const ammoItemEquipped = data.actor.equipment && data.actor.equipment[Container.EQUIP_SLOTS.Ammo];
        const ammoTypeEquipped = ammoItemEquipped && Content.getMetaItem(ammoItemEquipped.type).ammoType;
        hasAmmoForAttack = Boolean(ammoTypeNeeded && ammoTypeEquipped) && ammoTypeNeeded === ammoTypeEquipped;

        const clientConnection = this.getClientConnectionForCreature(data.actor);
        if (hasAmmoForAttack && clientConnection && ammoItemEquipped) {
          Container.setItemInContainer(this, clientConnection.equipment, Container.EQUIP_SLOTS.Ammo, {
            ...ammoItemEquipped,
            quantity: ammoItemEquipped.quantity - 1,
          });
        }
      }

      if (!hasAmmoForAttack) missReason = 'need-ammo';
    }

    // TODO: improve this math.
    if (!missReason && data.canBeBlocked) {
      // TODO use skill values.
      // const atk = attackSkill.level;
      const atk = 100;
      // @ts-expect-error
      const def = data.target.stats[attackType + 'Defense'] as number || 0;
      const passBlockRoll = Utils.randInt(0, atk) < Utils.randInt(0, def);

      let blocked = false;
      if (passBlockRoll) {
        if (attackType === 'magic' && attributeCheck(data.target, 'mana', 1)) {
          blocked = true;
          targetAttributesDelta.mana -= 1;
        } else if (attributeCheck(data.target, 'stamina', 1)) {
          blocked = true;
          targetAttributesDelta.stamina -= 1;
        }
      }

      if (blocked) missReason = 'blocked';
    }

    // TODO
    // const isCriticial = hitSuccess && hitSuccess && hitSuccess
    // const modifier = isCriticial ? Utils.randInt(2, 3) : 1;

    // Only some code paths need this, but kind of expensive, so cache it.
    let path_: Point4[];
    const getPath = () => {
      if (path_) return path_;
      path_ = calcStraightLine(data.actor.pos, data.target.pos)
        .map((p) => ({...data.actor.pos, ...p}));
      return path_;
    };

    let damage = 0;
    if (!missReason && data.damage) {
      // Armor can absorb some damage.
      // TODO: wear down / break armor
      damage = data.damage;
      const armor = data.target.stats.armor;
      const damageAbsorbedByArmor = Utils.randInt(0, Math.min(armor, damage));
      damage -= damageAbsorbedByArmor;
      damage = Utils.clamp(damage, 0, data.target.life.current);
    }

    if (!missReason && data.lineOfSight) {
      // using findPath does a cool "homing" attack, around corners. could be used for a neat weapon?
      // findPath(this.context, this.partition, data.actor.pos, data.target.pos)
      //   .map((p) => ({...p, w: data.actor.pos.w})),

      const isObstructed = !getPath().every((p) => {
        if (Utils.equalPoints(p, data.target.pos) || Utils.equalPoints(p, data.actor.pos)) {
          return true;
        }

        return this.context.map.walkable(p);
      });
      if (isObstructed) {
        missReason = 'obstructed';
        damage = 0;
      }
    }

    if (!missReason) {
      targetAttributesDelta.life -= damage;

      if (data.successAnimationName) {
        this.broadcastAnimation({
          name: data.successAnimationName,
          path: [data.target.pos],
        });
      }

      if (data.spell) {
        this.castSpell(data.spell, data.actor, data.target, undefined, false);
      }
    }

    if (data.projectileAnimationName && (!missReason || missReason === 'blocked')) {
      this.broadcastAnimation({
        name: data.projectileAnimationName,
        path: getPath(),
      });
    }

    // TODO: This bit is a little silly.
    const attributes = ['stamina', 'mana'] as const;
    const actorAttributesChanged = attributes.filter((k) => actorAttributesDelta[k] !== 0);
    for (const attribute of actorAttributesChanged) {
      adjustAttribute(data.actor, attribute, actorAttributesDelta[attribute]);
    }
    if (actorAttributesDelta.life) this.modifyCreatureLife(null, data.actor, actorAttributesDelta.life);

    const targetAttributesChanged = attributes.filter((k) => targetAttributesDelta[k] !== 0);
    for (const attribute of targetAttributesChanged) {
      adjustAttribute(data.target, attribute, targetAttributesDelta[attribute]);
    }
    if (targetAttributesDelta.life) this.modifyCreatureLife(data.actor, data.target, targetAttributesDelta.life);

    const notifyClient = (playerConnection: PlayerConnection) => {
      const thisCreature = playerConnection.creature;
      const otherCreature = playerConnection.creature === data.actor ? data.target : data.actor;

      let text;
      if (thisCreature === data.actor) {
        if (!missReason) {
          if (data.spell) {
            // TODO: say more?
            text = `You cast ${data.spell.name} on ${otherCreature.name}!`;
          } else {
            text = `You hit ${otherCreature.name} for ${damage} damage!`;
          }
        } else if (missReason === 'blocked') {
          text = `${otherCreature.name} blocked your attack`;
        } else if (missReason === 'need-ammo') {
          text = 'You need more ammo!';
        } else if (missReason === 'need-mana') {
          text = 'You need more mana!';
        } else if (missReason === 'need-stamina') {
          text = 'You need more stamina!';
        } else if (missReason === 'too-close') {
          text = 'You are too close!';
        } else if (missReason === 'too-far') {
          text = 'You are too far away!';
        } else if (missReason === 'obstructed') {
          text = 'You don\'t have a clear line of sight!';
        }
      } else {
        if (!missReason) {
          if (data.spell) {
            // TODO: say more?
            text = `${otherCreature.name} cast ${data.spell.name} on you!`;
          } else {
            text = `${otherCreature.name} hit you for ${damage} damage!`;
          }
        } else if (missReason === 'blocked') {
          text = `You blocked ${otherCreature.name}'s attack`;
        } else if (missReason === 'need-ammo') {
          // nothing
        } else if (missReason === 'need-mana') {
          // nothing
        } else if (missReason === 'need-stamina') {
          // nothing
        } else if (missReason === 'too-close') {
          // nothing
        } else if (missReason === 'too-far') {
          // nothing
        }
      }

      if (text) this.send(EventBuilder.chat({section: 'Combat', text}), playerConnection);

      if (!missReason) {
        const xpModifier = otherCreature.combatLevel / thisCreature.combatLevel;
        const xp = Math.round(xpModifier * damage * 10);
        const skill = thisCreature === data.actor ? data.attackSkill : data.defenseSkill;
        if (playerConnection.player.skills.has(skill.id)) {
          this.grantXp(playerConnection, skill.id, xp);
        }
      }
    };

    const actorClient = this.getClientConnectionForCreature(data.actor);
    if (actorClient) notifyClient(actorClient);

    const targetClient = this.getClientConnectionForCreature(data.target);
    if (targetClient) notifyClient(targetClient);

    return missReason;
  }

  modifyCreatureAttributes(actor: Creature | null, creature: Creature,
                           deltas: { life?: number; stamina?: number; mana?: number }) {
    if (creature.isNPC) return;

    const keys: Array<keyof typeof deltas> = [];
    const process = (key: keyof typeof deltas, delta: number, color: string) => {
      adjustAttribute(creature, key, delta);
      keys.push(key);
      this.conditionalBroadcast(EventBuilder.creatureStatus({
        creatureId: creature.id,
        text: delta > 0 ? `+${delta}` : `${delta}`,
        color,
      }), (client) => client.subscribedCreatureIds.has(creature.id));
    };
    if (deltas.life) process('life', deltas.life, 'red');
    if (deltas.stamina) process('stamina', deltas.stamina, 'gold');
    if (deltas.mana) process('mana', deltas.mana, 'blue');

    if (creature.life.current <= 0) {
      if (creature.isPlayer) {
        this.broadcastAnimation({
          name: 'diescream',
          path: [creature.pos],
        });

        const clientConnection = this.getClientConnectionForCreature(creature);
        this.warpCreature(creature, clientConnection?.player.spawnPos || this.getInitialSpawnpos2(), {
          warpAnimation: false,
        });
        adjustAttribute(creature, 'life', Math.floor(creature.life.max / 4));
        adjustAttribute(creature, 'stamina', Math.floor(creature.stamina.max / 4));
        adjustAttribute(creature, 'mana', Math.floor(creature.mana.max / 4));
        if (clientConnection) {
          this.creatureStates[clientConnection.creature.id].targetCreature = null;
          clientConnection.sendEvent(EventBuilder.updateSessionState({attackingCreatureId: null}));
        }
        if (actor) this.creatureStates[actor.id].targetCreature = null;
      } else {
        this.removeCreature(creature);
      }

      if (actor?.isPlayer) {
        const player = this.findPlayerForCreature(actor);
        if (player) {
          this.scriptManager.delegates.onPlayerKillCreature(player, creature);
        }
      }

      if (!creature.isPlayer && creature.type) {
        const loot: LootTable = [
          // TODO: remove
          {type: 'ref', id: 'food', chance: 20},
        ];
        let deadItemType = Content.getMetaItemByName('Decayed Remains').id;

        const template = Content.getMonsterTemplate(creature.type);
        if (template) {
          if (template.deadItem) deadItemType = template.deadItem;
          if (template.lootTable) loot.push(...template.lootTable);
        }

        loot.unshift({type: deadItemType});
        const itemsToSpawn = roll(loot, Content.getLootTables());
        for (const item of itemsToSpawn) {
          this.addItemNear(creature.pos, item);
        }
      }
    }
  }

  modifyCreatureLife(actor: Creature | null, creature: Creature, delta: number) {
    this.modifyCreatureAttributes(actor, creature, {life: delta});
  }

  modifyCreatureStamina(actor: Creature | null, creature: Creature, delta: number) {
    this.modifyCreatureAttributes(actor, creature, {stamina: delta});
  }

  modifyCreatureMana(actor: Creature | null, creature: Creature, delta: number) {
    this.modifyCreatureAttributes(actor, creature, {mana: delta});
  }

  /**
   * Assigns a buff to a creature.
   * If a buff has an id and there is a existing buff of that id:
   * When the existing buff's value is greater than the new one, the
   * new buff is ignored.
   * When the existing buff's value is less than the new one, the existing
   * one is removed.
   * When the same, the existing one remains but its duration is replaced with the
   * longest of the two.
   */
  assignCreatureBuff(creature: Creature, buff: Buff) {
    const existingBuff = buff.id && creature.buffs.find((b) => b.id === buff.id);
    if (existingBuff) {
      // TODO ignoring linearchange+percentchange combination here...
      const existingAmount = existingBuff.linearChange || existingBuff.percentChange || 0;
      const newAmount = buff.linearChange || buff.percentChange || 0;
      if (existingAmount > newAmount) {
        return;
      } else if (existingAmount < newAmount) {
        creature.buffs.splice(creature.buffs.indexOf(existingBuff), 1);
        creature.buffs.push(buff);
      } else {
        existingBuff.expiresAt = Math.max(existingBuff.expiresAt, buff.expiresAt);
      }
    } else {
      creature.buffs.push(buff);
    }
  }

  removeCreatureBuff(creature: Creature, id: string) {
    const index = creature.buffs.findIndex((buff) => id === buff.id);
    if (index !== -1) {
      creature.buffs.splice(index, 1);
    }
  }

  castSpell(spell: Spell, creature: Creature, targetCreature?: Creature, pos?: Point4, consumeMana = true) {
    const hasWand = Boolean(
      creature.equipment?.[Container.EQUIP_SLOTS.Weapon] &&
      Content.getMetaItem(creature.equipment[Container.EQUIP_SLOTS.Weapon]?.type || 0).class === 'Wand'
    );
    if (!hasWand) return 'You must equip a wand';

    if (creature.mana.current < spell.mana) return 'Not enough mana';

    if (spell.transformItemFrom && spell.transformItemTo) {
      if (!pos || this.context.map.getItem(pos)?.type !== spell.transformItemFrom.type) return 'Invalid item';

      this.setItemInWorld(pos, {...spell.transformItemTo});
    }

    const variance = spell.variance ? Utils.randInt(0, spell.variance) : 0;
    const deltas = {
      life: targetCreature && spell.life ? spell.life + variance : 0,
      stamina: targetCreature && spell.stamina ? spell.stamina + variance : 0,
    };
    if (targetCreature) {
      this.modifyCreatureAttributes(creature, targetCreature, deltas);
    }

    if (targetCreature) {
      for (const key of ['quickness', 'dexterity', 'strength', 'intelligence', 'wisdom', 'hero'] as const) {
        if (!spell[key]) continue;

        const buff: Buff = {
          id: `spell-${key}`, // TODO: add to id if buff is +/-
          expiresAt: Date.now() + 1000 * 60 * 5,
          linearChange: spell[key],
        };
        if (key === 'hero') {
          buff.skill = -1;
        } else {
          buff.attribute = key;
        }

        this.assignCreatureBuff(targetCreature, buff);
      }
    }

    for (const item of spell.spawnItems || []) {
      for (let i = 0; i < item.quantity; i++) {
        this.addItemNear(pos || creature.pos, {
          ...item,
          quantity: 1,
        }, {includeTargetLocation: true, checkCreatures: true});
      }
    }

    const somePos = pos || targetCreature?.pos;
    if (spell.animation && somePos) {
      this.broadcastAnimation({
        name: Content.getAnimationByIndex(spell.animation - 1).name,
        path: [somePos],
      });
    }

    if (consumeMana) {
      adjustAttribute(creature, 'mana', -spell.mana);
    }

    return;
  }

  removeCreature(creature: Creature) {
    creature.dead = true;
    this.context.creatures.delete(creature.id);

    const creatureState = this.creatureStates[creature.id];
    if (creatureState) {
      for (const state of Object.values(this.creatureStates)) {
        state.respondToCreatureRemoval(creature);
      }
      delete this.creatureStates[creature.id];
    }

    if (creature.tamedBy) {
      const player = this.context.players.get(creature.tamedBy);
      if (player) {
        player.tamedCreatureIds.delete(creature.id);
        const playerConnection = this.getClientConnectionForPlayer(player);
        if (playerConnection) {
          this.send(EventBuilder.chat({
            section: 'World',
            text: `${creature.name} has died :(`,
          }), playerConnection);
        }
      }
      // If player is not loaded in memory, that's okay–next time it is loaded
      // all of its tamed creatures will be checked.
    }

    this.broadcast(EventBuilder.removeCreature({
      id: creature.id,
    }));
  }

  findNearest(posOrRegion: { pos: TilePoint; range: number } | { region: Region }, includeTargetLocation: boolean,
              predicate: (tile: Tile, pos2: TilePoint) => boolean): TilePoint | null {
    let region;
    if ('pos' in posOrRegion) {
      region = {
        w: posOrRegion.pos.w,
        x: posOrRegion.pos.x - posOrRegion.range,
        y: posOrRegion.pos.y - posOrRegion.range,
        z: posOrRegion.pos.z,
        width: posOrRegion.range * 2,
        height: posOrRegion.range * 2,
      };
    } else {
      region = posOrRegion.region;
    }

    return this._findNearestImpl(region, includeTargetLocation, predicate);
  }

  findNearestWalkableTile(posOrRegion: { pos: TilePoint; range: number } | { region: Region }): TilePoint | null {
    return this.findNearest(posOrRegion, true, (tile, pos) => {
      return this.context.walkable(pos);
    });
  }

  _findNearestImpl(region: Region, includeTargetLocation: boolean,
                   predicate: (tile: Tile, pos2: TilePoint) => boolean): TilePoint | null {
    const centerPos = {
      w: region.w,
      x: region.x + Math.floor(region.width / 2),
      y: region.y + Math.floor(region.height / 2),
      z: region.z,
    };
    const minX = region.x;
    const maxX = region.x + region.width;
    const minY = region.y;
    const maxY = region.y + region.height;
    const partition = this.context.map.getPartition(region.w);
    const test = (l: TilePoint) => {
      if (l.x < minX || l.y < minY || l.x > maxX || l.y >= maxY) return false;
      if (!partition.inBounds(l)) return false;
      return predicate(partition.getTile(l), l);
    };

    // Starting at the center, test every location going out 1 distance
    // from the center in a spiral.
    // TODO: this isn't really the "nearest" by cartesian coordinates. Should fix.

    const w = centerPos.w;
    const x0 = centerPos.x;
    const y0 = centerPos.y;
    const z = centerPos.z;
    const range = Math.ceil(Math.max(region.width, region.height) / 2);
    for (let offset = includeTargetLocation ? 0 : 1; offset <= range; offset++) {
      for (let y1 = y0 - offset; y1 <= offset + y0; y1++) {
        if (y1 === y0 - offset || y1 === y0 + offset) {
          // First and last iterations of `let y1` loop test a row at
          // distance=offset from the center, going from left to right.
          for (let x1 = x0 - offset; x1 <= offset + x0; x1++) {
            if (test({w, x: x1, y: y1, z})) {
              return {w, x: x1, y: y1, z};
            }
          }
        } else {
          // The rest of the iterations test the columns at
          // distance=offset from the center.
          if (test({w, x: x0 - offset, y: y1, z})) {
            return {w, x: x0 - offset, y: y1, z};
          }
          if (test({w, x: x0 + offset, y: y1, z})) {
            return {w, x: x0 + offset, y: y1, z};
          }
        }
      }
    }

    return null;
  }

  addItemNear(pos: TilePoint, item: Item, opts?: { includeTargetLocation: boolean; checkCreatures: boolean }) {
    if (!opts) {
      opts = {
        includeTargetLocation: true,
        checkCreatures: false,
      };
    }

    const stackable = Content.getMetaItem(item.type).stackable;
    const nearestLoc = this.findNearest({pos, range: 6}, opts.includeTargetLocation,
      (tile, pos2) => {
        if (opts?.checkCreatures && this.context.getCreatureAt(pos2)) return false;
        if (!tile.item) return true;
        if (stackable && tile.item.type === item.type && tile.item.quantity + item.quantity <= MAX_STACK) return true;
        return false;
      });
    if (!nearestLoc) return; // TODO what to do in this case?

    const nearestTile = this.context.map.getTile(nearestLoc);
    if (nearestTile.item) {
      nearestTile.item.quantity += item.quantity;
    } else {
      nearestTile.item = item;
    }
  }

  setFloor(pos: TilePoint, floor: number) {
    this.context.map.getTile(pos).floor = floor;
  }

  setItemInWorld(pos: TilePoint, item?: Item) {
    this.context.map.getTile(pos).item = item;
  }

  updateCreatureLight(playerConnection: PlayerConnection) {
    const light = playerConnection.container.items.reduce((acc, cur) => {
      if (!cur) return acc;
      return Math.max(acc, Content.getMetaItem(cur.type).light || 0);
    }, 0);
    if (light === playerConnection.creature.light) return;

    playerConnection.creature.light = light;
  }

  deriveCreaturePropertiesFromEquipment(creature: Creature, equipmentItems: Array<Item | null>) {
    let equipmentGraphics: Graphics[] | undefined;
    let makeEquipmentGraphics = true;

    if (this.context.worldDataDefinition.baseDir === 'worlds/rpgwo-world') {
      // Equipment graphics only makes sense for the first few creature sprites.
      makeEquipmentGraphics = creature.graphics.file === 'rpgwo-player0.png' && creature.graphics.frames[0] <= 3;
    }

    if (makeEquipmentGraphics) {
      equipmentGraphics = this.makeCreatureImageData(equipmentItems);
    }

    // TODO: should these things be elsewhere? Only monsters use stats.x_defense ... player creatures
    // use their skill values.
    const stats: Omit<Creature['stats'], 'magicDefense' | 'meleeDefense' | 'missleDefense'> = {
      armor: 0,
      attackSpeed: 0,
      damageLow: 0,
      damageHigh: 0,
    };

    for (const item of equipmentItems) {
      const meta = item && Content.getMetaItem(item.type);
      if (!meta) continue;

      if (meta.equipSlot === 'Ammo' &&
        Content.getMetaItem(equipmentItems[Container.EQUIP_SLOTS.Weapon]?.type || 0).ammoType !== meta.ammoType) {
        continue;
      }

      stats.damageLow += meta.damageLow || 0;
      stats.damageHigh += meta.damageHigh || 0;
      stats.attackSpeed += meta.attackSpeed || 0;
      stats.armor += meta.armorLevel || 0;
    }

    stats.damageLow = Math.max(1, stats.damageLow);
    stats.damageHigh = Math.max(1, stats.damageHigh);
    stats.attackSpeed = Math.max(1, stats.attackSpeed);

    return {
      equipmentGraphics,
      stats,
    };
  }

  updateCreatureDataBasedOnEquipment(creature: Creature, equipment: Container, opts: { broadcast: boolean }) {
    const {equipmentGraphics, stats} = this.deriveCreaturePropertiesFromEquipment(creature, equipment.items);
    creature.equipment = equipment.items;
    creature.equipmentGraphics = equipmentGraphics;
    creature.stats = {
      ...stats,
      meleeDefense: 0,
      missleDefense: 0,
      magicDefense: 0,
    };

    creature.buffs = creature.buffs.filter((buff) => buff.id !== 'from-equipment');
    for (let i = Container.EQUIP_SLOTS.Neck; i <= Container.EQUIP_SLOTS.Wrist; i++) {
      const item = equipment.items[i];
      if (!item || !item.buff) continue;

      creature.buffs.push({
        ...item.buff,
        id: 'from-equipment',
        expiresAt: 0,
      });
    }
  }

  updateCreatureDataBasedOnInventory(playerConnection: PlayerConnection) {
    this.updateCreatureLight(playerConnection);

    // TODO: count equipment weight ...
    const burden = Container.countBurden(playerConnection.container);
    const maxBurden = Player.getMaxBurden(playerConnection.player);
    if (burden > maxBurden) {
      if (!playerConnection.creature.buffs.find((b) => b.id === 'overburdened')) {
        this.assignCreatureBuff(playerConnection.creature, {
          id: 'overburdened', skill: -1, percentChange: -0.3, expiresAt: 0,
        });
        this.send(EventBuilder.chat({section: 'World', text: 'You are overburdened!'}), playerConnection);
      }
    } else {
      if (playerConnection.creature.buffs.find((b) => b.id === 'overburdened')) {
        this.removeCreatureBuff(playerConnection.creature, 'overburdened');
        this.send(EventBuilder.chat({section: 'World', text: 'You are no longer overburdened!'}), playerConnection);
      }
    }
  }

  makeCreatureImageData(equipmentItems: Array<Item | null>): Graphics[] {
    if (Content.getBaseDir() === 'worlds/rpgwo-world') {
      const getEquipImage = (i: Item | null) => i ? Content.getMetaItem(i.type).equipImage : undefined;
      const graphics = [
        {file: 'rpgwo-arms0.png', frames: [0]},
        getEquipImage(equipmentItems[Container.EQUIP_SLOTS.Chest]) || {file: 'rpgwo-chest0.png', frames: [0]},
        getEquipImage(equipmentItems[Container.EQUIP_SLOTS.Head]) || {file: 'rpgwo-head0.png', frames: [0]},
        getEquipImage(equipmentItems[Container.EQUIP_SLOTS.Legs]) || {file: 'rpgwo-legs0.png', frames: [0]},
      ];
      const shieldGraphics = getEquipImage(equipmentItems[Container.EQUIP_SLOTS.Shield]);
      if (shieldGraphics) graphics.push(shieldGraphics);
      const weaponGraphics = getEquipImage(equipmentItems[Container.EQUIP_SLOTS.Weapon]);
      if (weaponGraphics) graphics.push(weaponGraphics);
      return graphics;
    }

    return [];
  }

  grantXp(playerConnection: PlayerConnection, skill: number, xp: number) {
    if (xp <= 0) return;
    if (!Player.hasSkill(playerConnection.player, skill)) return;

    if (playerConnection.player.specializedSkills.has(skill)) xp *= 2;

    const skillSummaryBefore = Player.getSkillSummary(playerConnection.player, playerConnection.creature.buffs, skill);
    const {skillLevelIncreased, combatLevelIncreased} =
      Player.incrementSkillXp(playerConnection.player, skill, xp) || {};
    const skillSummaryAfter =
      skillLevelIncreased && Player.getSkillSummary(playerConnection.player, playerConnection.creature.buffs, skill);

    if (skillLevelIncreased && skillSummaryAfter) {
      const skillName = Content.getSkill(skill).name;
      this.send(EventBuilder.chat({
        section: 'Skills',
        text: skillSummaryAfter.buffAmount ?
          `${skillName} is now level ${skillSummaryAfter.unbuffedLevel}! (${skillSummaryAfter.level} buffed)` :
          `${skillName} is now level ${skillSummaryAfter.level}!`,
      }), playerConnection);
      this.send(EventBuilder.notification({
        details: {
          type: 'skill-level',
          skillId: skill,
          from: skillSummaryBefore.unbuffedLevel,
          to: skillSummaryAfter.unbuffedLevel,
        },
      }), playerConnection);
    }

    if (combatLevelIncreased) {
      const combatLevel = Player.getCombatLevel(playerConnection.player).combatLevel;
      this.send(EventBuilder.chat({
        section: 'Skills',
        text: `You are now combat level ${combatLevel}!`,
      }), playerConnection);

      if (combatLevel % 5 === 0) {
        this.broadcastChat({
          from: 'SERVER',
          text: `${playerConnection.player.name} is now combat level ${combatLevel}!`,
        });
      }

      this.broadcastAnimation({
        name: 'LevelUp',
        path: [playerConnection.creature.pos],
      });
    }

    this.send(EventBuilder.xp({
      skill,
      xp,
    }), playerConnection);
  }

  tameCreature(player: Player, creature: Creature) {
    if (!creature.tameable || creature.isPlayer) return;

    player.tamedCreatureIds.add(creature.id);
    creature.tamedBy = player.id;
    this.creatureStates[creature.id].resetGoals();
  }

  ensureSectorLoaded(sectorPoint: TilePoint) {
    return this.context.map.getPartition(sectorPoint.w).getSectorAsync(sectorPoint);
  }

  ensureSectorLoadedForPoint(pos: TilePoint) {
    const sectorPoint = Utils.worldToSector(pos, SECTOR_SIZE);
    return this.ensureSectorLoaded({w: pos.w, ...sectorPoint});
  }

  advanceTime(ticks: number) {
    // const ticks = gameHours * (this.ticksPerWorldDay / 24);
    this.context.time.epoch += ticks;
    this.broadcast(EventBuilder.time({epoch: this.context.time.epoch}));

    // TODO
    // for (let i = 0; i < ticks; i++) {
    //   for (const [w, partition] of this.context.map.getPartitions()) {
    //     Array.from(this.growPartition(w, partition));
    //   }
    // }
  }

  getMessageTime() {
    return `The time is ${this.context.time.toString()}`;
  }

  getMessagePlayersOnline() {
    const players = [...this.context.players.values()]
      .filter((player) => player.loggedIn)
      .map((player) => player.name);
    return `${players.length} players online: ${players.join(', ')}`;
  }

  claimSector(owner: string, w: number, sectorPoint: PartitionPoint) {
    const key = `${w},${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}`;

    if (!key) {
      delete this.context.claims[key];
      return;
    }

    if (this.context.claims[key]) {
      const currentOwnerId = this.context.claims[key];
      const currentOwner = this.context.players.get(this.context.claims[key]);
      return {error: `Sector already owned by ${currentOwner?.name || currentOwnerId}`};
    }

    if (owner !== 'SERVER') {
      let numOwned = 0;
      for (const id of Object.values(this.context.claims)) {
        if (id === owner) numOwned += 1;
      }

      if (numOwned >= 1) {
        return {error: 'You own too much land'};
      }
    }

    this.context.claims[key] = owner;

    const player = this.context.players.get(owner);
    const clientConnection = player && this.getClientConnectionForPlayer(player);
    if (clientConnection) {
      this.send(EventBuilder.chat({section: 'World', text: 'You now own this land!'}), clientConnection);
    }
  }

  getSectorOwner(pos: Point4): string | undefined {
    const sectorPoint = Utils.worldToSector(pos, SECTOR_SIZE);
    const key = `${pos.w},${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}`;
    return this.context.claims[key];
  }

  private registerCreature(creature: Creature) {
    creature = sniffObject(creature, (op) => {
      const ops = this.pendingCreatureSniffedOperations.get(creature.id) || [];
      ops.push(op);
      this.pendingCreatureSniffedOperations.set(creature.id, ops);
    });
    this.creatureStates[creature.id] = new CreatureState(creature, this.context);
    this.context.setCreature(creature);
    this.broadcastInRange(EventBuilder.setCreature(creature), creature.pos, 20);
    return creature;
  }

  private async initClient(playerConnection: PlayerConnection) {
    const player = playerConnection.player;

    playerConnection.sendEvent(EventBuilder.initialize({
      player,
      creatureId: playerConnection.creature.id,
      secondsPerWorldTick: this.context.secondsPerWorldTick,
      ticksPerWorldDay: this.context.ticksPerWorldDay,
    }));
    playerConnection.sendEvent(EventBuilder.time({epoch: this.context.time.epoch}));

    playerConnection.sendEvent(EventBuilder.chat({
      section: 'World',
      from: 'SERVER',
      text: [
        `Welcome to Gridia, ${player.name}! Type "/help" for a list of chat commands`,
        this.getMessagePlayersOnline(),
        this.getMessageTime(),
      ].join('\n'),
    }));

    const partition = this.context.map.getPartition(playerConnection.creature.pos.w);
    playerConnection.sendEvent(EventBuilder.initializePartition({
      name: partition.name,
      w: playerConnection.creature.pos.w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));

    playerConnection.sendEvent(EventBuilder.setContainer(
      await this.context.getContainer(playerConnection.equipment.id)
    ));
    playerConnection.sendEvent(EventBuilder.setContainer(
      await this.context.getContainer(playerConnection.container.id)
    ));
    this.updateCreatureLight(playerConnection);
    setTimeout(() => {
      if (!playerConnection.creature) return;

      this.broadcastAnimation({
        name: 'WarpIn',
        path: [playerConnection.creature.pos],
      });
    }, 1000);
  }

  async getItem(location: ItemLocation) {
    if (location.source === 'world') {
      if (!location.pos) return;
      return this.context.map.getItem(location.pos);
    } else {
      if (location.index === undefined) return;
      const container = await this.context.getContainer(location.id);
      return container.items[location.index];
    }
  }

  /**
   * Sets an item at a world or container location. If quantity is >0, the
   * item will be removed from the given location.
   */
  setItem(location: ItemLocation, item: Item) {
    const maybeItem = item.quantity > 0 ? item : undefined;
    if (location.source === 'world') {
      if (!location.pos) throw new Error('invariant violated');
      this.setItemInWorld(location.pos, maybeItem);
    } else {
      if (location.index === undefined) throw new Error('invariant violated');

      const container = this.context.containers.get(location.id);
      if (!container) throw new Error('invalid container');

      Container.setItemInContainer(this, container, location.index, maybeItem);
    }
  }

  clearItem(location: ItemLocation) {
    if (location.source === 'world') {
      this.setItemInWorld(location.pos, undefined);
    } else {
      if (location.index === undefined) throw new Error('invariant violated');

      const container = this.context.containers.get(location.id);
      if (!container) throw new Error('invalid container');

      Container.setItemInContainer(this, container, location.index, undefined);
    }
  }

  private setupTickSections() {
    // super lame.
    this.taskRunner.registerTickSection({
      description: 'sync creatures',
      fn: () => {
        this.context.syncCreaturesOnTiles();
      },
    });

    this.taskRunner.registerTickSection({
      description: 'scripts',
      fn: () => this.scriptManager.tick(),
    });

    this.taskRunner.registerTickSection({
      description: 'expire buffs',
      fn: () => {
        const now = Date.now();
        for (const creature of this.context.creatures.values()) {
          if (!creature.buffs.length) continue;

          for (let i = creature.buffs.length - 1; i >= 0; i--) {
            if (creature.buffs[i].expiresAt === 0) continue;

            if (creature.buffs[i].expiresAt <= now) {
              creature.buffs.splice(i, 1);
            }
          }
        }
      },
    });

    // Update client connections subscribed creatures.
    function closeEnoughToSubscribe(pos1: TilePoint, pos2: TilePoint) {
      return pos1.w === pos2.w && pos1.z === pos2.z && Utils.dist(pos1, pos2) <= 50;
    }
    this.taskRunner.registerTickSection({
      description: 'update subscribed creatures',
      fn: () => {
        for (const clientConnection of this.context.clientConnections) {
          if (!clientConnection.isPlayerConnection()) continue;

          for (const creatureId of clientConnection.subscribedCreatureIds) {
            const creature = this.context.creatures.get(creatureId);
            if (creature && closeEnoughToSubscribe(clientConnection.creature.pos, creature.pos)) continue;

            clientConnection.subscribedCreatureIds.delete(creatureId);
            this.send(EventBuilder.removeCreature({id: creatureId}), clientConnection);
          }

          for (const creature of this.context.creatures.values()) {
            if (clientConnection.subscribedCreatureIds.has(creature.id)) continue;
            if (!closeEnoughToSubscribe(clientConnection.creature.pos, creature.pos)) continue;

            clientConnection.subscribedCreatureIds.add(creature.id);
            clientConnection.sendEvent(EventBuilder.setCreature(creature));
          }
        }
      },
    });

    // Handle creatures.
    this.taskRunner.registerTickSection({
      description: 'creature states',
      fn: () => {
        for (const state of Object.values(this.creatureStates)) {
          try {
            state.tick(this);
          } catch (err) {
            console.error(err);
          }
        }
      },
    });

    // Handle tiles seen logs.
    // TODO: this seems like a waste of resources. Should just trust client to do this.
    this.taskRunner.registerTickSection({
      description: 'tiles seen logs',
      rate: {seconds: 5},
      fn: () => {
        for (const clientConnection of this.context.clientConnections.values()) {
          if (!clientConnection.isPlayerConnection()) continue;

          server.context.map.forEach(clientConnection.creature.pos, 30, (pos) => {
            Player.markTileSeen(clientConnection.player, server.context.map, pos);
          });
        }
      },
    });

    this.taskRunner.registerTickSection({
      description: 'timePlayed',
      rate: {seconds: 1},
      fn: () => {
        for (const clientConnection of this.context.clientConnections.values()) {
          if (!clientConnection.isPlayerConnection()) continue;

          clientConnection.player.timePlayed += 1;
        }
      },
    });

    // Handle time.
    // TODO: Only load part of the world in memory and simulate growth of inactive areas on load.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const server = this;
    this.taskRunner.registerTickSection({
      description: 'time',
      // RPGWO does 20 second growth intervals.
      rate: {seconds: this.context.secondsPerWorldTick},
      *generator() {
        server.context.time.epoch += 1;

        for (const [w, partition] of server.context.map.getPartitions()) {
          yield* server.growPartition(w, partition);
        }
      },
    });

    this.taskRunner.registerTickSection({
      description: 'sync time',
      rate: {minutes: 1},
      fn: () => {
        this.broadcast(EventBuilder.time({epoch: this.context.time.epoch}));
      },
    });

    // Handle time.
    // let lastTimeSync = this._epochTicks;
    // this.taskRunner.registerTickSection({
    //   description: 'day/night',
    //   rate: { minutes: 1 },
    //   fn: () => {
    //     this._time += this._realTimeToGameTimeRatio;
    //     if (this._time - lastTimeSync > 60) {
    //       this.broadcast(EventBuilder.time({time: this._time}));
    //       lastTimeSync = this._time;
    //     }
    //   },
    // });

    // Handle hunger.
    this.taskRunner.registerTickSection({
      description: 'hunger',
      rate: {minutes: 2},
      fn: () => {
        for (const creature of this.context.creatures.values()) {
          if (!(creature.isPlayer || creature.eatGrass)) continue;

          if (creature.food <= 0) {
            // TODO: reduce stamina instead?
            this.modifyCreatureLife(null, creature, -10);
          } else {
            creature.food -= 1;
          }
        }
      },
    });

    // Handle messages.
    this.taskRunner.registerTickSection({
      description: 'messages',
      fn: async () => {
        for (const clientConnection of this.context.clientConnections) {
          if (clientConnection.messageQueue.length === 0) continue;

          const messages = [...clientConnection.messageQueue];
          clientConnection.messageQueue.length = 0;

          for (const message of messages) {
            const command = message.data;
            if (this.verbose) console.log('from client', message.id, command.type, command.args);
            // performance.mark(`${message.type}-start`);
            await this._serverInterface.processCommand(this, clientConnection, command.type, command.args)
              .then((data: any) => clientConnection.send({id: message.id, data}))
              .catch((e?: Error | string) => {
                // This is only done under test, because it makes debugging errors much simpler.
                // Otherwise, don't let an error kill this loop.
                if (process.env.GRIDIA_TEST) throw e;

                let error;
                if (e && e instanceof InvalidProtocolError) {
                  error = {message: e.message};
                } else if (e && e instanceof Error) {
                  error = {message: e.message, stack: e.stack};
                } else {
                  error = {message: e || 'Unknown error'};
                }
                clientConnection.send({id: message.id, error});
              });
            // performance.mark(`${message.type}-end`);
            // performance.measure(message.type, `${message.type}-start`, `${message.type}-end`);
          }
        }

        for (const [id, ops] of this.pendingCreatureSniffedOperations.entries()) {
          this.conditionalBroadcast(EventBuilder.setCreature({
            id,
            ops,
          }), (client) => client.subscribedCreatureIds.has(id));
        }
        this.pendingCreatureSniffedOperations.clear();

        for (const [player, ops] of this.pendingPlayerSniffedOperations.entries()) {
          const clientConnection = this.getClientConnectionForPlayer(player);
          if (clientConnection) {
            this.send(EventBuilder.setPlayer({
              ops,
            }), clientConnection);
          }
        }
        this.pendingPlayerSniffedOperations.clear();

        for (const {pos, ops} of this.pendingSectorSniffedOperations.values()) {
          // TODO: send only to clients that are near / are subscribed to Sector updates.
          this.broadcast(EventBuilder.setSector({
            ...pos,
            ops,
          }));
        }
        this.pendingSectorSniffedOperations.clear();

        for (const [container, ops] of this.pendingContainerSniffedOperations.entries()) {
          this.conditionalBroadcast(EventBuilder.setContainer({
            id: container.id,
            ops,
          }), (client) => {
            if (client.container.id === container.id) return true;
            if (client.equipment.id === container.id) return true;
            return client.registeredContainers.includes(container.id);
          });
        }
        this.pendingContainerSniffedOperations.clear();

        // TODO stream marks somewhere, and pull in isomorphic node/browser performance.
        // console.log(performance.getEntries());
        // performance.clearMarks();
        // performance.clearMeasures();
        // performance.clearResourceTimings();

        for (const {message, to, filter} of this.outboundMessages) {
          // Send a message to:
          // 1) a specific client
          // 2) clients based on a filter
          // 3) everyone (broadcast)
          if (to) {
            to.send(message);
          } else if (filter) {
            for (const clientConnection of this.context.clientConnections) {
              // If connection is not logged in yet, skip.
              if (!clientConnection.isPlayerConnection()) continue;
              if (filter(clientConnection)) clientConnection.send(message);
            }
          } else {
            for (const clientConnection of this.context.clientConnections) {
              // If connection is not logged in yet, skip.
              if (!clientConnection.isPlayerConnection()) continue;
              clientConnection.send(message);
            }
          }
        }
        this.outboundMessages = [];
      },
    });

    this.taskRunner.registerTickSection({
      description: 'tick performance',
      rate: {seconds: 10},
      fn: () => {
        if (!this.taskRunner.debugMeasureTiming) return;

        const perf = this.taskRunner.perf;

        // Only keep the last 10 seconds of ticks.
        const cutoff = performance.now() - 10 * 1000;
        const firstValid = perf.ticks.findIndex((tick) => tick.started >= cutoff);
        perf.ticks.splice(0, firstValid);
        perf.tickDurationAverage =
          perf.ticks.reduce((acc, cur) => acc + cur.duration, 0) / perf.ticks.length;
        perf.tickDurationMax = perf.ticks.reduce((acc, cur) => Math.max(acc, cur.duration), 0);
        const lastTick = perf.ticks[perf.ticks.length - 1];
        const secondsRange = (lastTick.started + lastTick.duration - perf.ticks[0].started) / 1000;
        const ticksPerSec = perf.ticks.length / secondsRange;
        const longestTick = perf.ticks.reduce((longest, cur) => {
          if (longest.duration > cur.duration) return longest;
          return cur;
        });

        // Send clients perf stats.
        const msg = JSON.stringify({
          ticksPerSec,
          avgDurationMs: perf.tickDurationAverage,
          maxDurationMs: perf.tickDurationMax,
          longestTick,
        }, null, 2);
        this.broadcast(EventBuilder.log({msg}));
      },
    });
  }

  private *growPartition(w: number, partition: WorldMapPartition) {
    // TODO: test which is faster?
    // iterate directly, iterate with getIteratorForArea, or iterate directly on partition.sectors ?

    let i = 0;
    for (const {pos, tile} of partition.getIteratorForArea({x: 0, y: 0, z: 0}, partition.width, partition.height)) {
      if (++i % 1000 === 0) yield;

      if (pos.z !== 0) continue; // TODO. No reason. lol.

      if (!tile.item) continue;

      const meta = Content.getMetaItem(tile.item.type);
      if (!meta || meta.growthDelta === undefined) continue;

      tile.item._growth = (tile.item._growth || 0) + 1;
      if (tile.item._growth < meta.growthDelta) continue;

      tile.item = meta.growthItem ? {
        ...tile.item,
        type: meta.growthItem,
        _growth: 0,
      } : undefined;
    }

    // for (let x = 0; x < partition.width; x++) {
    //   for (let y = 0; y < partition.height; y++) {
    //     const pos = { x, y, z: 0 };
    //     const item = partition.getItem(pos);
    //     if (!item) continue;
    //     const meta = Content.getMetaItem(item.type);
    //     if (!meta || !meta.growthItem) continue;

    //     item.growth = (item.growth || 0) + 1;
    //     if (item.growth >= meta.growthDelta) {
    //       item.type = meta.growthItem;
    //       item.growth = 0;
    //     }
    //   }
    // }
  }
}
