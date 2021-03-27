import { MAX_STACK, SECTOR_SIZE } from '../constants';
import * as Content from '../content';
import performance from '../performance';
import Player from '../player';
import ClientToServerProtocol from '../protocol/server-interface';
import * as EventBuilder from '../protocol/event-builder';
import * as Utils from '../utils';
import WorldMapPartition from '../world-map-partition';
import { WorldTime } from '../world-time';
import Container, { ContainerType } from '../container';
import { ProtocolEvent } from '../protocol/event-builder';
import ClientConnection from './client-connection';
import CreatureState from './creature-state';
import { ServerContext } from './server-context';
import TaskRunner from './task-runner';
import { Script, TestScript } from './script';

// TODO document how the f this works.

interface CtorOpts {
  context: ServerContext;
  verbose: boolean;
}

interface RegisterAccountOpts {
  username: string;
  password: string;
}

interface CreatePlayerOpts {
  name: string;
}

export default class Server {
  context: ServerContext;
  clientConnections: ClientConnection[] = [];
  outboundMessages = [] as Array<{
    message: Message;
    to?: ClientConnection;
    filter?: (client: ClientConnection) => boolean;
  }>;
  // @ts-ignore: this is always defined when accessed.
  currentClientConnection: ClientConnection;
  creatureStates: Record<number, CreatureState> = {};
  players = new Map<string, Player>();
  verbose: boolean;
  taskRunner = new TaskRunner(50);

  secondsPerWorldTick = 20;
  ticksPerWorldDay = 24 * 60 * 60 / this.secondsPerWorldTick / 8;
  time = new WorldTime(this.ticksPerWorldDay, this.ticksPerWorldDay / 2);

  creatureToOnSpeakCallbacks = new WeakMap<Creature, (clientConnection: ClientConnection) => Dialogue | undefined>();

  private _clientToServerProtocol = new ClientToServerProtocol();
  private _scripts: Script[] = [];
  private _quests: Quest[] = [];

  constructor(opts: CtorOpts) {
    this.context = opts.context;
    this.verbose = opts.verbose;
    this.setupTickSections();
  }

  reply(event: ProtocolEvent) {
    const message = { data: event };
    this.outboundMessages.push({ to: this.currentClientConnection, message });
  }

  broadcast(event: ProtocolEvent) {
    const message = { data: event };
    this.outboundMessages.push({ message });
  }

  send(event: ProtocolEvent, toClient: ClientConnection) {
    const message = { data: event };
    this.outboundMessages.push({ to: toClient, message });
  }

  conditionalBroadcast(event: ProtocolEvent, filter: (client: ClientConnection) => boolean) {
    const message = { data: event };
    this.outboundMessages.push({ filter, message });
  }

  broadcastInRange(event: ProtocolEvent, loc: TilePoint, range: number) {
    this.conditionalBroadcast(event, (client) => {
      const loc2 = client.player.creature.pos;
      if (loc2.z !== loc.z || loc2.w !== loc.w) return false;

      return Utils.dist(loc, loc2) <= range;
    });
  }

  broadcastAnimation(pos: TilePoint, name: string) {
    this.broadcastInRange(EventBuilder.animation({ ...pos, key: name }), pos, 30);
  }

  broadcastChat(opts: { from: string; message: string }) {
    console.log(`${opts.from}: ${opts.message}`);
    this.broadcast(EventBuilder.chat({
      from: opts.from,
      to: 'global',
      message: opts.message,
    }));
  }

  broadcastChatFromServer(message: string) {
    this.broadcastChat({ from: 'SERVER', message });
  }

  start() {
    this.taskRunner.start();
  }

  stop() {
    this.taskRunner.stop();
  }

  async save() {
    for (const clientConnection of this.clientConnections) {
      if (clientConnection.player) {
        await this.context.savePlayer(clientConnection.player);
      }
    }
    await this.context.save();
  }

  registerQuest(quest: Quest) {
    if (quest.stages.length === 0) {
      throw new Error('invalid quest');
    }

    this._quests.push(quest);
  }

  getQuest(id: string) {
    const quest = this._quests.find((q) => q.id === id);
    if (!quest) throw new Error(`unknown quest: ${id}`);
    return quest;
  }

  startDialogue(clientConnection: ClientConnection, dialogue: Dialogue) {
    clientConnection.activeDialogue = { dialogue, partIndex: 0 };
    this.sendCurrentDialoguePart(clientConnection, true);
  }

  processDialogueResponse(clientConnection: ClientConnection, choiceIndex?: number) {
    if (!clientConnection.activeDialogue) return;

    const { dialogue, partIndex } = clientConnection.activeDialogue;
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
      clientConnection.sendEvent(EventBuilder.dialogue({ index: -1 }));
    }
  }

  sendCurrentDialoguePart(clientConnection: ClientConnection, start: boolean) {
    if (!clientConnection.activeDialogue) return;

    const { dialogue, partIndex } = clientConnection.activeDialogue;
    clientConnection.sendEvent(EventBuilder.dialogue({
      dialogue: start ? {
        speakers: dialogue.speakers,
        parts: dialogue.parts,
      } : undefined,
      index: partIndex,
    }));
  }

  async registerAccount(clientConnection: ClientConnection, opts: RegisterAccountOpts) {
    if (await this.context.accountExists(opts.username)) {
      throw new Error('Username already taken');
    }

    const account: GridiaAccount = {
      username: opts.username,
      playerIds: [],
    };

    await this.context.saveAccount(account);
    await this.context.saveAccountPassword(account.username, opts.password);
  }

  async loginAccount(clientConnection: ClientConnection, opts: RegisterAccountOpts) {
    const account = await this.context.accountExists(opts.username) && await this.context.loadAccount(opts.username);
    const passwordMatches = account && await this.context.checkAccountPassword(opts.username, opts.password);

    if (!account || !passwordMatches) {
      throw new Error('Invalid login');
    }

    clientConnection.account = account;
    return account;
  }

  async createPlayer(clientConnection: ClientConnection, opts: CreatePlayerOpts) {
    if (this.context.playerNamesToIds.has(opts.name)) {
      throw new Error('Name already taken');
    }

    const { width, height } = this.context.map.getPartition(0);

    const center = { w: 0, x: Math.round(width / 2), y: Math.round(height / 2) + 3, z: 0 };
    // Make sure sector is loaded. Prevents hidden creature (race condition, happens often in worker).
    await this.ensureSectorLoadedForPoint(center);
    const spawnLoc = this.findNearest(center, 10, true, (_, loc) => this.context.walkable(loc)) || center;
    await this.ensureSectorLoadedForPoint(spawnLoc);

    const creature = {
      // Set later.
      id: 0,
      dead: false,
      name: opts.name,
      pos: spawnLoc,
      image: Utils.randInt(0, 4),
      isPlayer: true,
      speed: 2,
      life: 1000,
      food: 100,
      eat_grass: false,
      light: 0,
    };

    const player = new Player(creature);
    player.id = Utils.uuid();
    player.name = opts.name;
    player.isAdmin = true; // everyone is an admin, for now.

    player.creature = creature;

    // Mock xp for now.
    for (const skill of Content.getSkills()) {
      player.skills.set(skill.id, 1);
    }

    const container = this.context.makeContainer(ContainerType.Normal);
    player.containerId = container.id;
    if (opts.name !== 'test-user') {
      container.items[0] = { type: Content.getMetaItemByName('Wood Axe').id, quantity: 1 };
      container.items[1] = { type: Content.getMetaItemByName('Fire Starter').id, quantity: 1 };
      container.items[2] = { type: Content.getMetaItemByName('Pick').id, quantity: 1 };
      container.items[3] = { type: Content.getMetaItemByName('Plough').id, quantity: 1 };
      container.items[4] = { type: Content.getMetaItemByName('Mana Plant Seeds').id, quantity: 100 };
      container.items[5] = { type: Content.getMetaItemByName('Soccer Ball').id, quantity: 1 };
      container.items[6] = { type: Content.getMetaItemByName('Saw').id, quantity: 1 };
      container.items[7] = { type: Content.getMetaItemByName('Hammer and Nails').id, quantity: 1 };
      container.items[8] = { type: Content.getMetaItemByName('Lit Torch').id, quantity: 1 };
      container.items[9] = { type: Content.getMetaItemByName('Wood Planks').id, quantity: 100 };
    }

    const equipment = this.context.makeContainer(ContainerType.Equipment, 5);
    equipment.items[0] = { type: Content.getMetaItemByName('Iron Helmet Plate').id, quantity: 1 };
    player.equipmentContainerId = equipment.id;

    await this.context.savePlayer(player);

    clientConnection.account.playerIds.push(player.id);
    await this.context.saveAccount(clientConnection.account);

    this.context.playerNamesToIds.set(opts.name, player.id);

    await this.playerEnterWorld(clientConnection,
      { justCreated: true, player, playerId: player.id });
  }

  async playerEnterWorld(clientConnection: ClientConnection,
                         opts: { justCreated?: boolean; player?: Player; playerId: string }) {
    let player;
    if (opts.player) {
      player = opts.player;
    } else {
      player = this.players.get(opts.playerId) || await this.context.loadPlayer(opts.playerId);
    }

    clientConnection.container = await this.context.getContainer(player.containerId);
    clientConnection.equipment = await this.context.getContainer(player.equipmentContainerId);

    player.creature.id = this.context.nextCreatureId++;
    player.creature.imageData = this.makeCreatureImageData(clientConnection.equipment);
    player.creature = this.registerCreature(player.creature);

    this.players.set(player.id, player);
    clientConnection.player = player;
    await this.initClient(clientConnection);
    this.broadcastChatFromServer(`${clientConnection.player.name} has entered the world.`);

    if (opts.justCreated) {
      for (const script of this._scripts) {
        script.onPlayerCreated(player, clientConnection);
      }
    }
    for (const script of this._scripts) {
      script.onPlayerEnterWorld(player, clientConnection);
    }
  }

  removeClient(clientConnection: ClientConnection) {
    const index = this.clientConnections.indexOf(clientConnection);
    if (index === -1) return;

    this.clientConnections.splice(index, 1);
    if (clientConnection.player) {
      this.context.savePlayer(clientConnection.player);
      this.removeCreature(clientConnection.player.creature);
      this.players.delete(clientConnection.player.id);
      this.broadcastAnimation(clientConnection.player.creature.pos, 'WarpOut');
      this.broadcastChatFromServer(`${clientConnection.player.name} has left the world.`);
    }
  }

  async consumeAllMessages() {
    while (this.clientConnections.some((c) => c.hasMessage()) || this.outboundMessages.length) {
      await this.taskRunner.tick();
    }
  }

  makeCreatureFromTemplate(creatureType: number | Monster, pos: TilePoint) {
    const template = typeof creatureType === 'number' ? Content.getMonsterTemplate(creatureType) : creatureType;
    if (!template) return; // TODO

    const creature = {
      id: this.context.nextCreatureId++,
      dead: false,
      image: template.image,
      image_type: template.image_type,
      name: template.name,
      pos: this.findNearest(pos, 10, true, (_, loc) => this.context.walkable(loc)) || pos,
      isPlayer: false,
      roam: template.roam,
      speed: template.speed,
      life: template.life,
      food: 10,
      eat_grass: template.eat_grass,
      light: 0,
    };

    this.registerCreature(creature);
    return creature;
  }

  registerCreature(creature: Creature): Creature {
    this.creatureStates[creature.id] = new CreatureState(creature, this.context);
    this.context.setCreature(creature);
    return creature;
  }

  moveCreature(creature: Creature, pos: TilePoint | null) {
    if (pos) {
      creature.pos = pos;
    }
    this.broadcastPartialCreatureUpdate(creature, ['pos']);
    this.creatureStates[creature.id].warped = false;
  }

  broadcastPartialCreatureUpdate(creature: Creature, keys: Array<keyof Creature>) {
    const partialCreature: Partial<Creature> = {
      id: creature.id,
    };
    for (const key of keys) {
      // @ts-ignore
      partialCreature[key] = creature[key];
    }
    this.conditionalBroadcast(EventBuilder.setCreature({
      partial: true,
      ...partialCreature,
    }), (client) => client.subscribedCreatureIds.has(creature.id));
  }

  findPlayerForCreature(creature: Creature) {
    for (const player of this.players.values()) {
      if (player.creature === creature) return player;
    }
  }

  async warpCreature(creature: Creature, pos: TilePoint | null) {
    if (pos && !this.context.map.inBounds(pos)) return;

    if (pos) await this.ensureSectorLoadedForPoint(pos);
    this.moveCreature(creature, pos);
    this.creatureStates[creature.id].warped = true;
    this.creatureStates[creature.id].path = [];
  }

  modifyCreatureLife(actor: Creature | null, creature: Creature, delta: number) {
    creature.life += delta;

    this.broadcastPartialCreatureUpdate(creature, ['life']);

    if (delta < 0) {
      this.broadcastAnimation(creature.pos, 'Attack');
    }

    if (creature.life <= 0) {
      this.removeCreature(creature);
      this.broadcastAnimation(creature.pos, 'diescream');

      if (actor?.isPlayer) {
        const player = this.findPlayerForCreature(actor);
        if (player) {
          for (const script of this._scripts) {
            script.onPlayerKillCreature(player, creature);
          }
        }
      }
    }
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

  findNearest(loc: TilePoint, range: number, includeTargetLocation: boolean,
              predicate: (tile: Tile, loc2: TilePoint) => boolean): TilePoint | null {
    const w = loc.w;
    const partition = this.context.map.getPartition(w);
    const test = (l: TilePoint) => {
      if (!partition.inBounds(l)) return false;
      return predicate(partition.getTile(l), l);
    };

    const x0 = loc.x;
    const y0 = loc.y;
    const z = loc.z;
    for (let offset = includeTargetLocation ? 0 : 1; offset <= range; offset++) {
      for (let y1 = y0 - offset; y1 <= offset + y0; y1++) {
        if (y1 === y0 - offset || y1 === y0 + offset) {
          for (let x1 = x0 - offset; x1 <= offset + x0; x1++) {
            if (test({ w, x: x1, y: y1, z })) {
              return { w, x: x1, y: y1, z };
            }
          }
        } else {
          if (test({ w, x: x0 - offset, y: y1, z })) {
            return { w, x: x0 - offset, y: y1, z };
          }
          if (test({ w, x: x0 + offset, y: y1, z })) {
            return { w, x: x0 + offset, y: y1, z };
          }
        }
      }
    }

    return null;
  }

  addItemNear(loc: TilePoint, item: Item) {
    const stackable = Content.getMetaItem(item.type).stackable;
    const nearestLoc = this.findNearest(loc, 6, true,
      (tile) => {
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

  setFloor(loc: TilePoint, floor: number) {
    this.context.map.getTile(loc).floor = floor;
    this.broadcast(EventBuilder.setFloor({
      ...loc,
      floor,
    }));
  }

  setItem(loc: TilePoint, item?: Item) {
    this.context.map.getTile(loc).item = item;
    this.broadcast(EventBuilder.setItem({
      location: Utils.ItemLocation.World(loc),
      item,
    }));
  }

  updateCreatureLight(client: ClientConnection) {
    const light = client.container.items.reduce((acc, cur) => {
      if (!cur) return acc;
      return Math.max(acc, Content.getMetaItem(cur.type).light);
    }, 0);
    if (light === client.player.creature.light) return;

    client.player.creature.light = light;
    this.broadcastPartialCreatureUpdate(client.player.creature, ['light']);
  }

  setItemInContainer(id: string, index: number, item?: Item) {
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
      const client = this.clientConnections.find((c) => c.container.id === id);
      if (!client) return;

      this.updateCreatureLight(client);
    }

    if (container.type === ContainerType.Equipment) {
      const creature = [
        ...this.players.values(),
      ].find((player) => player.equipmentContainerId === id)?.creature;
      if (creature) {
        creature.imageData = this.makeCreatureImageData(container);
        this.broadcastPartialCreatureUpdate(creature, ['imageData']);
      }
    }
  }

  makeCreatureImageData(container: Container) {
    const getEquipImage = (i: Item | null) => i ? Content.getMetaItem(i.type).equipImage : undefined;
    return {
      arms: 0,
      chest: getEquipImage(container.items[Container.EQUIP_SLOTS.Chest]) || 0,
      head: getEquipImage(container.items[Container.EQUIP_SLOTS.Head]) || 0,
      legs: getEquipImage(container.items[Container.EQUIP_SLOTS.Legs]) || 0,
      shield: getEquipImage(container.items[Container.EQUIP_SLOTS.Shield]),
      weapon: getEquipImage(container.items[Container.EQUIP_SLOTS.Weapon]),
    };
  }

  grantXp(clientConnection: ClientConnection, skill: number, xp: number) {
    const currentXp = clientConnection.player.skills.get(skill);
    const newXp = (currentXp || 0) + xp;
    clientConnection.player.skills.set(skill, newXp);

    this.send(EventBuilder.xp({
      skill,
      xp,
    }), clientConnection);
  }

  ensureSectorLoaded(sectorPoint: TilePoint) {
    return this.context.map.getPartition(sectorPoint.w).getSectorAsync(sectorPoint);
  }

  ensureSectorLoadedForPoint(loc: TilePoint) {
    const sectorPoint = Utils.worldToSector(loc, SECTOR_SIZE);
    return this.ensureSectorLoaded({ w: loc.w, ...sectorPoint });
  }

  advanceTime(ticks: number) {
    // const ticks = gameHours * (this.ticksPerWorldDay / 24);
    this.time.epoch += ticks;
    this.broadcast(EventBuilder.time({ epoch: this.time.epoch }));

    // TODO
    // for (let i = 0; i < ticks; i++) {
    //   for (const [w, partition] of this.context.map.getPartitions()) {
    //     Array.from(this.growPartition(w, partition));
    //   }
    // }
  }

  getMessageTime() {
    return `The time is ${this.time.toString()}`;
  }

  getMessagePlayersOnline() {
    const players = [...this.players.values()].map((player) => player.name);
    return `${players.length} players online: ${players.join(', ')}`;
  }

  private async initClient(clientConnection: ClientConnection) {
    const player = clientConnection.player;

    clientConnection.sendEvent(EventBuilder.initialize({
      player,
      secondsPerWorldTick: this.secondsPerWorldTick,
      ticksPerWorldDay: this.ticksPerWorldDay,
    }));
    clientConnection.sendEvent(EventBuilder.time({ epoch: this.time.epoch }));

    clientConnection.sendEvent(EventBuilder.chat({
      from: 'World',
      to: '', // TODO
      message: [
        `Welcome to Gridia, ${player.name}! Type "/help" for a list of chat commands`,
        this.getMessagePlayersOnline(),
        this.getMessageTime(),
      ].join('\n'),
    }));

    const partition = this.context.map.getPartition(player.creature.pos.w);
    clientConnection.sendEvent(EventBuilder.initializePartition({
      w: player.creature.pos.w,
      x: partition.width,
      y: partition.height,
      z: partition.depth,
    }));

    // TODO: next line not necessary. but removing breaks tests ...
    clientConnection.sendEvent(EventBuilder.setCreature({ partial: false, ...player.creature }));
    clientConnection.sendEvent(EventBuilder.container({
      container: await this.context.getContainer(clientConnection.equipment.id),
    }));
    clientConnection.sendEvent(EventBuilder.container(
      { container: await this.context.getContainer(clientConnection.container.id) },
    ));
    this.updateCreatureLight(clientConnection);
    setTimeout(() => {
      this.broadcastAnimation(player.creature.pos, 'WarpIn');
    }, 1000);
  }

  private setupTickSections() {
    // super lame.
    this.taskRunner.registerTickSection({
      description: 'sync creatures',
      fn: () => {
        this.context.syncCreaturesOnTiles();
      },
    });

    this._scripts.push(new TestScript(this));
    this._scripts[0].onStart();
    this.taskRunner.registerTickSection({
      description: 'scripts',
      fn: async () => {
        for (const script of this._scripts) {
          await script.tick();
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
        for (const clientConnection of this.clientConnections) {
          // TODO ?
          if (!clientConnection.player) continue;

          for (const creatureId of clientConnection.subscribedCreatureIds) {
            const creature = this.context.creatures.get(creatureId);
            if (creature && closeEnoughToSubscribe(clientConnection.player.creature.pos, creature.pos)) continue;

            clientConnection.subscribedCreatureIds.delete(creatureId);
            // TODO send unregister command.
          }

          for (const creature of this.context.creatures.values()) {
            if (clientConnection.subscribedCreatureIds.has(creature.id)) continue;
            if (!closeEnoughToSubscribe(clientConnection.player.creature.pos, creature.pos)) continue;

            clientConnection.subscribedCreatureIds.add(creature.id);
            clientConnection.sendEvent(EventBuilder.setCreature({ partial: false, ...creature }));
          }
        }
      },
    });

    // Handle creatures.
    this.taskRunner.registerTickSection({
      description: 'creature states',
      fn: () => {
        for (const state of Object.values(this.creatureStates)) {
          state.tick(this);
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
              newPos = { ...creature.pos, z: creature.pos.z + 1 };
            } else if (meta.class === 'CaveUp') {
              newPos = { ...creature.pos, z: creature.pos.z - 1 };
            } else if (meta.trapEffect === 'Warp' && item.warpTo) {
              newPos = { ...item.warpTo };
              playWarpSound = true;
            }
            if (!newPos || !map.inBounds(newPos) || !await map.walkableAsync(newPos)) continue;

            if (playWarpSound) {
              this.broadcastAnimation(creature.pos, 'WarpOut');
              this.broadcastAnimation(newPos, 'WarpIn');
            }
            await this.warpCreature(creature, newPos);
          }
        }
      },
    });

    // Handle tiles seen logs.
    this.taskRunner.registerTickSection({
      description: 'tiles seen logs',
      rate: { seconds: 5 },
      fn: () => {
        for (const player of this.players.values()) {
          server.context.map.forEach(player.creature.pos, 30, (loc) => {
            player.tilesSeenLog.markSeen(server.context.map, loc);
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
      rate: { seconds: this.secondsPerWorldTick },
      *generator() {
        server.time.epoch += 1;

        for (const [w, partition] of server.context.map.getPartitions()) {
          if (partition.loaded) {
            yield* server.growPartition(w, partition);
          }
        }
      },
    });

    this.taskRunner.registerTickSection({
      description: 'sync time',
      rate: { minutes: 1 },
      fn: () => {
        server.broadcast(EventBuilder.time({ epoch: server.time.epoch }));
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
      rate: { minutes: 1 },
      fn: () => {
        for (const creature of this.context.creatures.values()) {
          if (!creature.eat_grass) return; // TODO: let all creature experience hunger pain.

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
        for (const clientConnection of this.clientConnections) {
          if (clientConnection.messageQueue.length === 0) continue;

          this.currentClientConnection = clientConnection;
          const messages = [...clientConnection.messageQueue];
          clientConnection.messageQueue.length = 0;

          for (const message of messages) {
            const command = message.data;
            if (this.verbose) console.log('from client', message.id, command.type, command.args);
            // performance.mark(`${message.type}-start`);
            try {
              const onMethodName = 'on' + command.type[0].toUpperCase() + command.type.substr(1);
              // @ts-ignore
              // eslint-disable-next-line
              await Promise.resolve(this._clientToServerProtocol[onMethodName](this, command.args))
                .then((data: any) => clientConnection.send({ id: message.id, data }))
                .catch((e?: Error | string) => {
                  // TODO: why is this catch AND the try/catch needed?
                  const error = e ? e.toString() : 'Unknown error';
                  clientConnection.send({ id: message.id, data: { error } });
                });
            } catch (error) {
              // Don't let a bad message kill the message loop.
              console.error(error, message);
              clientConnection.send({ id: message.id, data: { error: error ? error.toString() : 'Unknown error' } });
            }
            // performance.mark(`${message.type}-end`);
            // performance.measure(message.type, `${message.type}-start`, `${message.type}-end`);
          }
          // @ts-ignore
          this.currentClientConnection = undefined;
        }

        // TODO stream marks somewhere, and pull in isomorphic node/browser performance.
        // console.log(performance.getEntries());
        // performance.clearMarks();
        // performance.clearMeasures();
        // performance.clearResourceTimings();

        for (const { message, to, filter } of this.outboundMessages) {
          // Send a message to:
          // 1) a specific client
          // 2) clients based on a filter
          // 3) everyone (broadcast)
          if (to) {
            to.send(message);
          } else if (filter) {
            for (const clientConnection of this.clientConnections) {
              // If connection is not logged in yet, skip.
              if (!clientConnection.player) continue;
              if (filter(clientConnection)) clientConnection.send(message);
            }
          } else {
            for (const clientConnection of this.clientConnections) {
              // If connection is not logged in yet, skip.
              if (!clientConnection.player) continue;
              clientConnection.send(message);
            }
          }
        }
        this.outboundMessages = [];
      },
    });

    this.taskRunner.registerTickSection({
      description: 'tick performance',
      rate: { seconds: 10 },
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
        this.broadcast(EventBuilder.log({ msg }));
      },
    });
  }

  private *growPartition(w: number, partition: WorldMapPartition) {
    // TODO: test which is faster?
    // iterate directly, iterate with getIteratorForArea, or iterate directly on partition.sectors ?

    let i = 0;
    for (const { pos, tile } of partition.getIteratorForArea({ x: 0, y: 0, z: 0 }, partition.width, partition.height)) {
      if (++i % 1000 === 0) yield;

      if (pos.z !== 0) continue; // TODO. No reason. lol.

      if (!tile.item) continue;

      const meta = Content.getMetaItem(tile.item.type);
      if (!meta || !meta.growthItem) continue;

      tile.item.growth = (tile.item.growth || 0) + 1;
      if (tile.item.growth < meta.growthDelta) continue;

      tile.item.type = meta.growthItem;
      tile.item.growth = 0;
      this.broadcast(EventBuilder.setItem({
        location: Utils.ItemLocation.World({ ...pos, w }),
        item: tile.item,
      }));
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
