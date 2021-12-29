import {MAX_STACK, SECTOR_SIZE, WATER} from '../constants.js';
import * as Container from '../container.js';
import * as Content from '../content.js';
import {calcStraightLine} from '../lib/line.js';
import {roll} from '../lib/loot-table.js';
import * as Player from '../player.js';
import * as EventBuilder from '../protocol/event-builder.js';
import {ProtocolEvent} from '../protocol/event-builder.js';
import {ServerInterface} from '../protocol/server-interface.js';
import * as Utils from '../utils.js';
import {WorldMapPartition} from '../world-map-partition.js';

import {ClientConnection, PlayerConnection} from './client-connection.js';
import {CreatureState} from './creature-state.js';
import {adjustAttribute, attributeCheck} from './creature-utils.js';
import {Script} from './script.js';
import {BallScript} from './scripts/ball-script.js';
import {BasicScript} from './scripts/basic-script.js';
import {DogScript} from './scripts/dog-script.js';
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
  successProjectileAnimationName?: string;
}

export class Server {
  context: ServerContext;
  outboundMessages = [] as Array<{
    message: Message;
    to?: ClientConnection;
    filter?: (playerConnection: PlayerConnection) => boolean;
  }>;
  // TODO: WeakMap
  creatureStates: Record<number, CreatureState> = {};

  verbose: boolean;
  taskRunner = new TaskRunner(50);

  private _serverInterface = new ServerInterface();
  private _scripts: Array<Script<any>> = [];
  private _quests: Quest[] = [];

  scriptDelegates = {
    onPlayerCreated: (player: Player, playerConnection: PlayerConnection) => {
      for (const script of this._scripts) {
        script.onPlayerCreated(player, playerConnection);
      }
    },
    onPlayerEnterWorld: (player: Player, playerConnection: PlayerConnection) => {
      for (const script of this._scripts) {
        script.onPlayerEnterWorld(player, playerConnection);
      }
    },
    onPlayerKillCreature: (player: Player, creature: Creature) => {
      for (const script of this._scripts) {
        script.onPlayerKillCreature(player, creature);
      }
    },
    onPlayerMove: (opts: { playerConnection: PlayerConnection; from: Point4; to: Point4 }) => {
      Object.freeze(opts);
      for (const script of this._scripts) {
        script.onPlayerMove(opts);
      }
    },
    onItemAction: (opts:
    { playerConnection: PlayerConnection; type: string; location: ItemLocation; to?: ItemLocation }) => {
      Object.freeze(opts);
      for (const script of this._scripts) {
        script.onItemAction(opts);
      }
    },
  };

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
    this.setupTickSections();
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
      const loc2 = client.creature.pos;
      if (loc2.z !== pos.z || loc2.w !== pos.w) return false;

      return Utils.dist(pos, loc2) <= range;
    });
  }

  broadcastAnimation(animationInstance: GridiaAnimationInstance) {
    this.broadcastInRange(EventBuilder.animation({...animationInstance}), animationInstance.path[0], 30);
  }

  broadcastChat(opts: { from: string; creatureId?: number; text: string }) {
    console.log(`${opts.from}: ${opts.text}`);
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
    this.taskRunner.start();
  }

  stop() {
    this.taskRunner.stop();
  }

  save() {
    return this.context.save();
  }

  registerQuest(quest: Quest) {
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

  startDialogue(clientConnection: ClientConnection, dialogue: Dialogue) {
    clientConnection.activeDialogue = {dialogue, partIndex: 0};
    this.sendCurrentDialoguePart(clientConnection, true);
  }

  processDialogueResponse(clientConnection: ClientConnection, choiceIndex?: number) {
    if (!clientConnection.activeDialogue) return;

    const {dialogue, partIndex} = clientConnection.activeDialogue;
    const part = dialogue.parts[partIndex];

    let nextPartIndex;
    if (choiceIndex !== undefined && part.choices && part.choices.length < choiceIndex) {
      // TODO
      nextPartIndex = partIndex + 1;
    } else if (partIndex + 1 < dialogue.parts.length) {
      nextPartIndex = partIndex + 1;
    } else {
      dialogue.onFinish && dialogue.onFinish();
    }

    if (nextPartIndex !== undefined) {
      clientConnection.activeDialogue.partIndex = nextPartIndex;
      this.sendCurrentDialoguePart(clientConnection, false);
    } else {
      clientConnection.activeDialogue = undefined;
      clientConnection.sendEvent(EventBuilder.dialogue({index: -1}));
    }
  }

  sendCurrentDialoguePart(clientConnection: ClientConnection, start: boolean) {
    if (!clientConnection.activeDialogue) return;

    const {dialogue, partIndex} = clientConnection.activeDialogue;
    clientConnection.sendEvent(EventBuilder.dialogue({
      dialogue: start ? {
        speakers: dialogue.speakers,
        parts: dialogue.parts,
      } : undefined,
      index: partIndex,
    }));
  }

  async registerAccount(clientConnection: ClientConnection, opts: RegisterAccountOpts) {
    if (await this.context.accountExists(opts.id)) {
      throw new Error('Account with this id already exists');
    }

    const account: GridiaAccount = {
      id: opts.id,
      playerIds: [],
    };

    await this.context.saveAccount(account);
  }

  async loginAccount(clientConnection: ClientConnection, opts: RegisterAccountOpts) {
    const account = await this.context.accountExists(opts.id) && await this.context.loadAccount(opts.id);
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
    const spawnPos = this.findNearest({pos: center, range: 10}, true, (_, pos) => this.context.walkable(pos)) || center;
    await this.ensureSectorLoadedForPoint(spawnPos);

    return spawnPos;
  }

  getInitialSpawnLoc2() {
    const {width, height} = this.context.map.getPartition(0);
    const center = {w: 0, x: Math.round(width / 2), y: Math.round(height / 2) + 3, z: 0};
    const spawnPos = this.findNearest({pos: center, range: 10}, true, (_, pos) => this.context.walkable(pos)) || center;
    return spawnPos;
  }

  async createPlayer(clientConnection: ClientConnection, opts: Protocol.Commands.CreatePlayer['params']) {
    if (!clientConnection.account) return Promise.reject('Not logged in');
    if (opts.name.length > 20) return Promise.reject('Name too long');
    if (opts.name.length <= 2) return Promise.reject('Name too short');
    if (opts.name.match(/\s{2,}/) || opts.name.trim() !== opts.name) return Promise.reject('Name has bad spacing');
    if (!opts.name.match(/^[A-ZÀ-ÚÄ-Ü 0-9]+$/i)) return Promise.reject('Name has illegal characters');

    if (this.context.playerNamesToIds.has(opts.name)) {
      throw new Error('Name already taken');
    }

    const characterCreation = this.context.worldDataDefinition.characterCreation;
    if (characterCreation.simple) {
      opts.attributes = new Map();
      for (const key of Player.ATTRIBUTES) {
        opts.attributes.set(key, 0);
      }
      for (let i = 0; i < characterCreation.attributePoints; i++) {
        const key = Player.ATTRIBUTES[i % Player.ATTRIBUTES.length];
        opts.attributes.set(key, 1 + (opts.attributes.get(key) || 0));
      }

      opts.skills = new Set([]);
    }

    for (const id of characterCreation.requiredSkills || []) {
      opts.skills.add(id);
    }

    let attributeValueSum = 0;
    for (const value of opts.attributes.values()) attributeValueSum += value;
    if (attributeValueSum !== characterCreation.attributePoints) {
      throw new Error('Must use all attribute points');
    }

    let skillPointSum = 0;
    for (const skill of opts.skills) skillPointSum += Content.getSkill(skill).skillPoints;
    if (skillPointSum > characterCreation.skillPoints) {
      throw new Error(`skill points can't be greater than ${characterCreation.skillPoints}`);
    }

    const pos = await this.getInitialSpawnLoc();
    const player: Player = {
      id: Utils.uuid(),
      name: opts.name,
      loggedIn: true,
      attributes: new Map(),
      skills: new Map(),
      skillPoints: characterCreation.skillPoints,
      questStates: new Map(),
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
      buffs: [],
    };

    for (const attribute of Player.ATTRIBUTES) {
      player.attributes.set(attribute, {
        baseLevel: opts.attributes.get(attribute) || 0,
        earnedLevel: 0,
      });
    }

    for (const skill of opts.skills) {
      Player.learnSkill(player, skill);
      player.skillPoints -= Content.getSkill(skill).skillPoints;
    }

    player.life = Player.getAttributeValue(player, 'life', player.buffs).level;
    player.stamina = Player.getAttributeValue(player, 'stamina', player.buffs).level;
    player.mana = Player.getAttributeValue(player, 'mana', player.buffs).level;

    const container = this.context.makeContainer('normal');
    player.containerId = container.id;

    const equipment = this.context.makeContainer('equipment', Object.keys(Container.EQUIP_SLOTS).length);
    player.equipmentContainerId = equipment.id;

    if (opts.name !== 'TestUser' && this.context.worldDataDefinition.baseDir === 'worlds/rpgwo-world') {
      container.items[0] = {type: Content.getMetaItemByName('Wood Axe').id, quantity: 1};
      container.items[1] = {type: Content.getMetaItemByName('Fire Starter').id, quantity: 1};
      container.items[2] = {type: Content.getMetaItemByName('Pick').id, quantity: 1};
      container.items[3] = {type: Content.getMetaItemByName('Plough').id, quantity: 1};
      container.items[4] = {type: Content.getMetaItemByName('Mana Plant Seeds').id, quantity: 100};
      container.items[5] = {type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1};
      container.items[6] = {type: Content.getMetaItemByName('Saw').id, quantity: 1};
      container.items[7] = {type: Content.getMetaItemByName('Hammer and Nails').id, quantity: 1};
      container.items[8] = {type: Content.getMetaItemByName('Lit Torch').id, quantity: 1};
      container.items[9] = {type: Content.getMetaItemByName('Wood Planks').id, quantity: 100};
      container.items[10] = {type: Content.getMetaItemByName('Bow').id, quantity: 1};
      container.items[11] = {type: Content.getMetaItemByName('Arrow').id, quantity: 500};
      container.items[12] = {type: Content.getMetaItemByName('Iron Wand').id, quantity: 1};
      container.items[13] = {type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1};

      equipment.items[0] = {type: Content.getMetaItemByName('Iron Helmet Plate').id, quantity: 1};
    }

    this.context.savePlayer(player);
    await this.context.db.endTransaction();

    clientConnection.account.playerIds.push(player.id);
    await this.context.saveAccount(clientConnection.account);

    this.context.playerNamesToIds.set(opts.name, player.id);

    await this.playerEnterWorld(clientConnection,
      {justCreated: true, player, playerId: player.id});
  }

  async playerEnterWorld(clientConnection: ClientConnection,
                         opts: { justCreated?: boolean; player?: Player; playerId: string }) {
    let player;
    if (opts.player) {
      player = opts.player;
    } else {
      player = await this.context.getPlayer(opts.playerId);
    }

    clientConnection.container = await this.context.getContainer(player.containerId);
    clientConnection.equipment = await this.context.getContainer(player.equipmentContainerId);

    if (Content.getBaseDir() === 'worlds/rpgwo-world') {
      player.buffs = [
        {
          id: 'fakebuff0',
          expiresAt: Date.now() + Math.round(1000 * 60 * 60 * 10),
          skill: 1,
          percentChange: 0.1,
          linearChange: 10,
        },
        {
          id: 'fakebuff1',
          expiresAt: Date.now() + Math.round(1000 * 60 * 60 * 10),
          skill: 4,
          percentChange: 0.2,
          linearChange: 25,
        },
      ];
    }

    const creature: Creature = {
      id: this.context.nextCreatureId++,
      dead: false,
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
      // TODO
      food: 100,
      eatGrass: false,
      light: 0,
      combatLevel: Player.getCombatLevel(player).combatLevel,
      // set later
      stats: {} as Creature['stats'],
      buffs: player.buffs,
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
    clientConnection.creature = creature;
    this.registerCreature(creature);

    this.context.players.set(player.id, player);
    clientConnection.player = player;
    clientConnection.assertsPlayerConnection();

    await this.initClient(clientConnection);
    this.broadcastChatFromServer(`${clientConnection.player.name} has entered the world.`);
    player.loggedIn = true;

    if (opts.justCreated) {
      this.scriptDelegates.onPlayerCreated(player, clientConnection);
    }
    this.scriptDelegates.onPlayerEnterWorld(player, clientConnection);
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
      this.context.savePlayer(clientConnection.player, clientConnection.creature);
      this.removeCreature(clientConnection.creature);
      // Do not remove player yet, not until the next server.save(), in case player logs back in
      // before the next save.
      // this.context.players.delete(clientConnection.player.id);
      this.broadcastAnimation({
        name: 'WarpOut',
        path: [clientConnection.creature.pos],
      });
      this.broadcastChatFromServer(`${clientConnection.player.name} has left the world.`);

      const clientConnectionBase = clientConnection as ClientConnection;
      clientConnectionBase.creature = undefined;
      clientConnectionBase.player = undefined;
      clientConnectionBase.container = undefined;
      clientConnectionBase.equipment = undefined;
    }
  }

  async consumeAllMessages() {
    while (this.context.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      await this.taskRunner.tick();
    }
  }

  createCreature(descriptor: CreatureDescriptor, pos: TilePoint): Creature | undefined {
    let template = Content.getMonsterTemplate(descriptor.type);
    if (!template) {
      console.error(`invalid monster template: ${descriptor.type}, falling back to default`);
      template = Content.getMonsterTemplate(1);
    }

    pos = this.findNearest({pos, range: 10}, true, (_, pos2) => this.context.walkable(pos2)) || pos;

    const life = template.life || 10;
    const stamina = template.stamina || 10;
    const mana = template.mana || 10;

    const creature: Creature = {
      id: this.context.nextCreatureId++,
      type: template.id,
      dead: false,
      graphics: template.graphics,
      name: template.name,
      pos,
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
      // TODO: get stats from monster.ini
      stats: {
        armor: 0,
        attackSpeed: template.speed,
        damageLow: 1,
        damageHigh: 2,
        meleeDefense: template.meleeDefense || 0,
        missleDefense: template.missleDefense || 0,
        magicDefense: template.magicDefense || 0,
      },
      buffs: [],
      magicLevel: template.magicLevel,
      magicChances: template.magicChances,
      ...descriptor.partial,
    };

    if (creature.equipment) {
      Object.assign(creature, this.deriveCreaturePropertiesFromEquipment(creature, creature.equipment));
      creature.stats.meleeDefense = template.meleeDefense || 0;
      creature.stats.missleDefense = template.missleDefense || 0;
      creature.stats.magicDefense = template.magicDefense || 0;
    }

    this.registerCreature(creature);

    if (descriptor.onSpeak) {
      creature.canSpeak = true;
      this.creatureStates[creature.id].onSpeakCallback = descriptor.onSpeak;
    }

    return creature;
  }

  moveCreature(creature: Creature, pos: TilePoint) {
    const tile = this.context.map.getTile(pos);
    const meta = tile.item && Content.getMetaItem(tile.item.type);

    // TODO: generalize
    if (tile.floor === WATER && Content.getBaseDir() === 'worlds/rpgwo-world') {
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

    creature.pos = pos;
    this.broadcastPartialCreatureUpdate(creature, ['pos']);
    this.creatureStates[creature.id].warped = false;
  }

  broadcastPartialCreatureUpdate(creature: Creature, keys: Array<keyof Creature>) {
    const partialCreature: Partial<Creature> = {
      id: creature.id,
    };
    for (const key of keys) {
      // @ts-expect-error
      partialCreature[key] = creature[key];
    }
    this.conditionalBroadcast(EventBuilder.setCreature({
      partial: true,
      ...partialCreature,
    }), (client) => client.subscribedCreatureIds.has(creature.id));
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

  async warpCreature(creature: Creature, pos: TilePoint) {
    if (!this.context.map.inBounds(pos)) return;

    await this.ensureSectorLoadedForPoint(pos);
    this.moveCreature(creature, pos);
    this.creatureStates[creature.id].warped = true;
    this.creatureStates[creature.id].path = [];
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
          this.setItemInContainer(clientConnection.equipment.id, Container.EQUIP_SLOTS.Ammo, {
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

    let path;
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
      path = calcStraightLine(data.actor.pos, data.target.pos)
        .map((p) => ({...data.actor.pos, ...p}));
      // using findPath does a cool "homing" attack, around corners. could be used for a neat weapon?
      // findPath(this.context, this.partition, data.actor.pos, data.target.pos)
      //   .map((p) => ({...p, w: data.actor.pos.w})),

      const isObstructed = !path.every((p) => {
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

      if (data.successProjectileAnimationName && path) {
        this.broadcastAnimation({
          name: data.successProjectileAnimationName,
          path,
        });
      }

      if (data.spell) {
        this.castSpell(data.spell, data.actor, data.target, undefined, false);
      }
    }

    // TODO: This bit is a little silly.
    const attributes = ['stamina', 'mana'] as const;
    const actorAttributesChanged = attributes.filter((k) => actorAttributesDelta[k] !== 0);
    for (const attribute of actorAttributesChanged) {
      adjustAttribute(data.actor, attribute, actorAttributesDelta[attribute]);
    }
    if (actorAttributesChanged.length) this.broadcastPartialCreatureUpdate(data.actor, actorAttributesChanged);
    if (actorAttributesDelta.life) this.modifyCreatureLife(null, data.actor, actorAttributesDelta.life);

    const targetAttributesChanged = attributes.filter((k) => targetAttributesDelta[k] !== 0);
    for (const attribute of targetAttributesChanged) {
      adjustAttribute(data.target, attribute, targetAttributesDelta[attribute]);
    }
    if (targetAttributesChanged.length) this.broadcastPartialCreatureUpdate(data.target, targetAttributesChanged);
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
    if (keys.length) this.broadcastPartialCreatureUpdate(creature, keys);

    if (creature.life.current <= 0) {
      if (creature.isPlayer) {
        this.broadcastAnimation({
          name: 'diescream',
          path: [creature.pos],
        });

        const player = this.findPlayerForCreature(creature);
        this.warpCreature(creature, player?.spawnPos || this.getInitialSpawnLoc2());
        adjustAttribute(creature, 'life', Math.floor(creature.life.max / 4));
        adjustAttribute(creature, 'stamina', Math.floor(creature.stamina.max / 4));
        adjustAttribute(creature, 'mana', Math.floor(creature.mana.max / 4));
        this.broadcastPartialCreatureUpdate(creature, ['life', 'stamina', 'mana']);
        this.creatureStates[creature.id].targetCreature = null;
      } else {
        this.removeCreature(creature);
      }

      if (actor?.isPlayer) {
        const player = this.findPlayerForCreature(actor);
        if (player) {
          this.scriptDelegates.onPlayerKillCreature(player, creature);
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

  assignCreatureBuff(creature: Creature, buff: Buff) {
    const existingBuff = creature.buffs.find((b) => b.id === buff.id);
    if (existingBuff) {
      // TODO: keep the larger buff.
      existingBuff.expiresAt = Math.max(existingBuff.expiresAt, buff.expiresAt);
    } else {
      creature.buffs.push(buff);
    }
    this.broadcastPartialCreatureUpdate(creature, ['buffs']);
  }

  castSpell(spell: Spell, creature: Creature, targetCreature?: Creature, pos?: Point4, consumeMana = true) {
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
      this.broadcastPartialCreatureUpdate(creature, ['mana']);
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

    this.broadcast(EventBuilder.removeCreature({
      id: creature.id,
    }));
  }

  findNearest(posOrRegion: {pos: TilePoint; range: number} | {region: Region}, includeTargetLocation: boolean,
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
      (tile, loc2) => {
        if (opts?.checkCreatures && this.context.getCreatureAt(loc2)) return false;
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

    this.broadcast(EventBuilder.setItem({
      location: Utils.ItemLocation.World(nearestLoc),
      item: nearestTile.item,
    }));
  }

  setFloor(pos: TilePoint, floor: number) {
    this.context.map.getTile(pos).floor = floor;
    this.broadcast(EventBuilder.setFloor({
      ...pos,
      floor,
    }));
  }

  setItemInWorld(pos: TilePoint, item?: Item) {
    this.context.map.getTile(pos).item = item;
    this.broadcast(EventBuilder.setItem({
      location: Utils.ItemLocation.World(pos),
      item,
    }));
  }

  updateCreatureLight(playerConnection: PlayerConnection) {
    const light = playerConnection.container.items.reduce((acc, cur) => {
      if (!cur) return acc;
      return Math.max(acc, Content.getMetaItem(cur.type).light);
    }, 0);
    if (light === playerConnection.creature.light) return;

    playerConnection.creature.light = light;
    this.broadcastPartialCreatureUpdate(playerConnection.creature, ['light']);
  }

  setItemInContainer(id: string, index: number, item?: Item) {
    if (item?.quantity === 0) item = undefined;

    const container = this.context.containers.get(id);
    if (!container) throw new Error(`no container: ${id}`);

    const prevItem = container.items[index];
    container.items[index] = item || null;

    this.conditionalBroadcast(EventBuilder.setItem({
      location: Utils.ItemLocation.Container(id, index),
      item,
    }), (clientConnection) => {
      if (clientConnection.container.id === id) return true;
      if (clientConnection.equipment.id === id) return true;
      return clientConnection.registeredContainers.includes(id);
    });

    // TODO: should light sources be equippable and only set creature light then?
    if ((prevItem && Content.getMetaItem(prevItem.type).light) || (item && Content.getMetaItem(item.type).light)) {
      const client = this.context.clientConnections.find((c) => c.container?.id === id);
      if (client) this.updateCreatureLight(client.ensurePlayerConnection());
    }

    if (container.type === 'equipment') {
      const creature = [
        ...this.context.clientConnections.values(),
      ].find((client) => client.equipment?.id === id)?.creature;
      if (creature) {
        this.updateCreatureDataBasedOnEquipment(creature, container, {broadcast: true});
      }
    }
  }

  deriveCreaturePropertiesFromEquipment(creature: Creature, equipmentItems: Array<Item | null>) {
    let equipmentGraphics: Graphics[];
    let makeEquipmentGraphics = true;

    if (this.context.worldDataDefinition.baseDir === 'worlds/rpgwo-world') {
      // Equipment graphics only makes sense for the first few creature sprites.
      makeEquipmentGraphics = creature.graphics.file === 'rpgwo-player0.png' && creature.graphics.frames[0] <= 3;
    }

    if (makeEquipmentGraphics) {
      equipmentGraphics = this.makeCreatureImageData(equipmentItems);
    } else {
      equipmentGraphics = [];
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

    if (opts.broadcast) this.broadcastPartialCreatureUpdate(creature, ['equipmentGraphics', 'stats', 'buffs']);
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
      this.send(EventBuilder.notifaction({
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

      this.updateClientPlayer(playerConnection);
    }

    this.send(EventBuilder.xp({
      skill,
      xp,
    }), playerConnection);
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

  updateClientPlayer(playerConnection: PlayerConnection) {
    // Lazy way to update Player.
    playerConnection.sendEvent(EventBuilder.initialize({
      player: playerConnection.player,
      creatureId: playerConnection.creature.id,
      secondsPerWorldTick: this.context.secondsPerWorldTick,
      ticksPerWorldDay: this.context.ticksPerWorldDay,
    }));
  }

  private registerCreature(creature: Creature) {
    this.creatureStates[creature.id] = new CreatureState(creature, this.context);
    this.context.setCreature(creature);
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
      w: playerConnection.creature.pos.w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));

    // TODO: next line not necessary. but removing breaks tests ...
    playerConnection.sendEvent(EventBuilder.setCreature({partial: false, ...playerConnection.creature}));
    playerConnection.sendEvent(EventBuilder.container({
      container: await this.context.getContainer(playerConnection.equipment.id),
    }));
    playerConnection.sendEvent(EventBuilder.container(
      {container: await this.context.getContainer(playerConnection.container.id)},
    ));
    this.updateCreatureLight(playerConnection);
    setTimeout(() => {
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
      this.setItemInContainer(location.id, location.index, maybeItem);
    }
  }

  clearItem(location: ItemLocation) {
    if (location.source === 'world') {
      this.setItemInWorld(location.pos, undefined);
    } else {
      if (location.index === undefined) throw new Error('invariant violated');
      this.setItemInContainer(location.id, location.index, undefined);
    }
  }

  getScriptStates(): ScriptState[] {
    return this._scripts.map((s) => s.getScriptState());
  }

  private addScript(ScriptClass: new (...args: any) => Script<any>) {
    const script = new ScriptClass(this);
    const errors = script.getScriptState().errors;
    if (errors.length) {
      // TODO: these aren't showing in admin Scripts panel.
      console.error(`Failed to add script ${ScriptClass.name}.\n` + JSON.stringify(errors, null, 2));
    } else {
      this._scripts.push(script);
      script.onStart();
      script.state = 'started';
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

    this.addScript(BasicScript);
    this.addScript(BallScript);
    this.addScript(DogScript);

    this.taskRunner.registerTickSection({
      description: 'scripts',
      fn: async () => {
        for (const script of this._scripts) {
          if (script.state === 'started') {
            await script.tick();
          }
        }
      },
    });

    this.taskRunner.registerTickSection({
      description: 'expire buffs',
      fn: () => {
        const now = Date.now();
        for (const creature of this.context.creatures.values()) {
          if (!creature.buffs.length) continue;

          let modified = false;
          for (let i = creature.buffs.length - 1; i >= 0; i--) {
            if (creature.buffs[i].expiresAt === 0) continue;

            if (creature.buffs[i].expiresAt <= now) {
              creature.buffs.splice(i, 1);
              modified = true;
            }
          }

          if (modified) {
            this.broadcastPartialCreatureUpdate(creature, ['buffs']);
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
            // TODO send unregister command.
          }

          for (const creature of this.context.creatures.values()) {
            if (clientConnection.subscribedCreatureIds.has(creature.id)) continue;
            if (!closeEnoughToSubscribe(clientConnection.creature.pos, creature.pos)) continue;

            clientConnection.subscribedCreatureIds.add(creature.id);
            clientConnection.sendEvent(EventBuilder.setCreature({partial: false, ...creature}));
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

    // Handle stairs and warps.
    this.taskRunner.registerTickSection({
      description: 'stairs and warps',
      fn: async () => {
        for (const state of Object.values(this.creatureStates)) {
          const creature = state.creature;
          if (state.warped) continue;

          const map = this.context.map;
          const item = map.getItem(creature.pos);
          if (item) {
            const meta = Content.getMetaItem(item.type);

            let newPos = null;
            let playWarpSound = false;
            if (meta.class === 'CaveDown') {
              newPos = {...creature.pos, z: creature.pos.z + 1};
            } else if (meta.class === 'CaveUp') {
              newPos = {...creature.pos, z: creature.pos.z - 1};
            } else if (meta.trapEffect === 'Warp' && item.warpTo) {
              newPos = {...item.warpTo};
              playWarpSound = true;
            }
            if (!newPos || !map.inBounds(newPos) || !await map.walkableAsync(newPos)) continue;

            if (playWarpSound) {
              this.broadcastAnimation({
                name: 'WarpOut',
                path: [creature.pos],
              });
              this.broadcastAnimation({
                name: 'WarpIn',
                path: [newPos],
              });
            }
            await this.warpCreature(creature, newPos);
          }
        }
      },
    });

    // Handle tiles seen logs.
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

    // Handle time.
    // TODO: Only load part of the world in memory and simulate growth of inactive areas on load.
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
        server.broadcast(EventBuilder.time({epoch: server.context.time.epoch}));
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
      rate: {minutes: 1},
      fn: () => {
        for (const creature of this.context.creatures.values()) {
          if (!creature.eatGrass) return; // TODO: let all creature experience hunger pain.

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
            try {
              const onMethodName = 'on' + command.type[0].toUpperCase() + command.type.substr(1);
              // @ts-expect-error
              await Promise.resolve(this._serverInterface[onMethodName](this, clientConnection, command.args))
                .then((data: any) => clientConnection.send({id: message.id, data}))
                .catch((e?: Error | string) => {
                  // TODO: why is this catch AND the try/catch needed?
                  let error = 'SERVER_ERROR: ';
                  if (e && e instanceof Error) {
                    error += e.message;
                    error += e.stack;
                  } else {
                    error += e || 'Unknown error';
                  }
                  clientConnection.send({id: message.id, data: {error}});
                });
            } catch (e: any) {
              // Don't let a bad message kill the message loop.
              console.error(e, message);
              let error = 'SERVER_ERROR: ';
              if (e && e instanceof Error) {
                error += e.message;
                error += e.stack;
              } else {
                error += e || 'Unknown error';
              }
              clientConnection.send({
                id: message.id,
                data: {error},
              });
            }
            // performance.mark(`${message.type}-end`);
            // performance.measure(message.type, `${message.type}-start`, `${message.type}-end`);
          }
        }

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

      tile.item.growth = (tile.item.growth || 0) + 1;
      if (tile.item.growth < meta.growthDelta) continue;

      const newItem = meta.growthItem ? {
        ...tile.item,
        type: meta.growthItem,
        growth: 0,
      } : undefined;
      this.setItemInWorld({...pos, w}, newItem);
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
    //       this.broadcast(EventBuilder.setItem({
    //         location: Utils.ItemLocation.World({ ...pos, w }),
    //         item,
    //       }));
    //     }
    //   }
    // }
  }
}
