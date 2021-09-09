import * as path from 'path';

import {Context} from '../context';
import {IsoFs} from '../iso-fs';
import * as WireSerializer from '../lib/wire-serializer';
import * as Utils from '../utils';
import {WorldMap} from '../world-map';
import {WorldMapPartition} from '../world-map-partition';

import {ClientConnection} from './client-connection';
import {ScriptConfigStore} from './scripts/script-config-store';

async function readJson(fs: IsoFs, filePath: string) {
  const json = await fs.readFile(filePath);

  try {
    return WireSerializer.deserialize(json);
  } catch (_) {
    throw new Error(`cannot parse json at ${filePath}: ${json}`);
  }
}

export class ServerContext extends Context {
  clientConnections: ClientConnection[] = [];
  players = new Map<string, Player>();
  playerNamesToIds = new Map<string, string>();
  claims: Record<string, string> = {};
  nextCreatureId = 1;
  scriptConfigStore = new ScriptConfigStore({});

  accountDir: string;
  containerDir: string;
  miscDir: string;
  playerDir: string;
  sectorDir: string;

  constructor(map: WorldMap, public fs: IsoFs) {
    super(map);
    this.accountDir = 'accounts';
    this.containerDir = 'containers';
    this.miscDir = 'misc';
    this.playerDir = 'players';
    this.sectorDir = 'sectors';
  }

  static async load(fs: IsoFs) {
    const map = new WorldMap();
    const context = new ServerContext(map, fs);

    await fs.mkdir(context.accountDir, {recursive: true});
    await fs.mkdir(context.containerDir, {recursive: true});
    await fs.mkdir(context.miscDir, {recursive: true});
    await fs.mkdir(context.playerDir, {recursive: true});
    await fs.mkdir(context.sectorDir, {recursive: true});

    const meta = await readJson(fs, context.metaPath());

    // TODO: figure out if I want to save creatures at all.
    // const creatures = JSON.parse(await fs.readFile(context.creaturesPath()));
    // for (const creature of creatures) {
    //   context.creatures.set(creature.id, creature);
    //   // Purposefully do not set creature on tile, as that would load the sector.
    // }

    context.nextCreatureId = meta.nextCreatureId || 1;

    // Just load all the partitions for now.
    const partitionIds = (await fs.readdir(context.sectorDir)).map(Number);
    for (const w of partitionIds) {
      await context.loadPartition(w);
    }

    context.playerNamesToIds.clear();
    for (const playerPath of await fs.readdir(context.playerDir)) {
      const player: Player = await readJson(fs, context.playerDir + '/' + playerPath);
      context.playerNamesToIds.set(player.name, player.id);
    }

    const scriptConfigPath = context.miscDir + '/script-config.json';
    if (await fs.exists(scriptConfigPath)) {
      context.scriptConfigStore = new ScriptConfigStore(await readJson(fs, scriptConfigPath));
    } else {
      context.scriptConfigStore = new ScriptConfigStore({});
    }

    return context;
  }

  async loadSectorClaims(): Promise<Record<string, string>> {
    const claimsPath = this.miscPath('claims.json');
    if (await this.fs.exists(claimsPath)) return readJson(this.fs, claimsPath);
    return {};
  }

  async saveSectorClaims() {
    const claimsPath = this.miscPath('claims.json');
    await this.fs.writeFile(claimsPath, JSON.stringify(this.claims));
  }

  async loadPartition(w: number) {
    const partitionPath = this.partitionMetaPath(w);
    const partitionMeta = await readJson(this.fs, partitionPath);
    this.map.initPartition(w, partitionMeta.width, partitionMeta.height, partitionMeta.depth);
  }

  async loadSector(sectorPoint: TilePoint) {
    const sector = await readJson(this.fs, this.sectorPath(sectorPoint)) as Sector;

    // Set creatures (all of which are always loaded in memory) to the sector (of which only active areas are loaded).
    // Kinda lame, I guess.
    // TODO remove now? currently are not saving creatures to disk.
    // for (const creature of this.creatures.values()) {
    //   if (Utils.equalPoints(sectorPoint, Utils.worldToSector(creature.pos, SECTOR_SIZE))) {
    //     server.registerCreature(creature);
    //   }
    // }

    return sector;
  }

  async saveSector(sectorPoint: TilePoint) {
    const sector = this.map.getSector(sectorPoint);
    // Don't save creatures.
    const data = sector.map((tiles) => tiles.map((tile) => ({floor: tile.floor, item: tile.item})));
    const json = JSON.stringify(data, null, 2);
    await this.fs.writeFile(this.sectorPath(sectorPoint), json);
  }

  accountExists(username: string) {
    return this.fs.exists(this.accountPath(username));
  }

  async loadAccount(username: string): Promise<GridiaAccount> {
    return readJson(this.fs, this.accountPath(username));
  }

  async saveAccount(account: GridiaAccount) {
    const json = WireSerializer.serialize(account);
    await this.fs.writeFile(this.accountPath(account.id), json);
  }

  async savePlayer(player: Player, creature?: Creature) {
    if (creature) {
      player.loc = creature.pos;
      player.life = creature.life.current;
      player.stamina = creature.stamina.current;
      player.mana = creature.mana.current;
      player.buffs = creature.buffs;
    }

    const json = WireSerializer.serialize(player);
    await this.fs.writeFile(this.playerPath(player.id), json);

    const container = this.containers.get(player.containerId);
    if (container) await this.saveContainer(container);

    const equipment = this.containers.get(player.equipmentContainerId);
    if (equipment) await this.saveContainer(equipment);
  }

  loadPlayer(playerId: string): Promise<Player> {
    return readJson(this.fs, this.playerPath(playerId));
  }

  makeContainer(type: Container['type'], size = 30) {
    const container = {id: Utils.uuid(), type, items: Array(size).fill(null)};
    this.containers.set(container.id, container);
    return container;
  }

  getContainerIdFromItem(item: Item) {
    if (!item.containerId) {
      item.containerId = this.makeContainer('normal', 10).id;
    }

    return item.containerId;
  }

  async saveContainer(container: Container) {
    const json = JSON.stringify({type: container.type, items: container.items}, null, 2);
    await this.fs.writeFile(this.containerPath(container.id), json);
  }

  // TODO defer to loader like sector is?
  async getContainer(id: string) {
    let container = this.containers.get(id);
    if (container) return container;

    // TODO handle error.
    // (following todo may not be valid anymore)
    // TODO: even tho fs is stubbed in the browser build, parcel sees `readFileSync` and insists
    // that this be statically analyzable so it can do its bundling. Should create an interface that
    // doesn't trip up parcel's grepping for `.readFile`... (loadData?)
    const data = await readJson(this.fs, this.containerPath(id)) as {
      type: Container['type'];
      items: Array<Item | null>;
    };
    container = {id, type: data.type, items: data.items};
    this.containers.set(id, container);
    return container;
  }

  async save() {
    await this.fs.mkdir(this.accountDir, {recursive: true});
    await this.fs.mkdir(this.containerDir, {recursive: true});
    await this.fs.mkdir(this.miscDir, {recursive: true});
    await this.fs.mkdir(this.playerDir, {recursive: true});
    await this.fs.mkdir(this.sectorDir, {recursive: true});

    await this.saveMeta();
    await this.saveSectorClaims();

    for (const clientConnection of this.clientConnections) {
      if (clientConnection.player) {
        await this.savePlayer(clientConnection.player, clientConnection.creature);
      }
    }

    for (const [w, partition] of this.map.getPartitions()) {
      await this.savePartition(w, partition);
    }

    for (const container of this.containers.values()) {
      await this.saveContainer(container);
    }

    // TODO: figure out if I want to save creatures at all.
    // Player creatures are transient (new creature made for each login), so don't bother saving them.
    // const npcs = [...this.creatures.values()].filter((c) => !c.isPlayer);
    // await fs.writeFile(this.creaturesPath(), JSON.stringify(npcs, null, 2));
  }

  protected async saveMeta() {
    const meta = {
      nextCreatureId: this.nextCreatureId,
    };
    await this.fs.writeFile(this.metaPath(), JSON.stringify(meta, null, 2));
  }

  protected async savePartition(w: number, partition: WorldMapPartition) {
    await this.fs.mkdir(this.partitionPath(w), {recursive: true});

    const meta = {
      width: partition.width,
      height: partition.height,
      depth: partition.depth,
    };
    await this.fs.writeFile(this.partitionMetaPath(w), JSON.stringify(meta, null, 2));

    const promises = [];
    for (let sx = 0; sx < partition.sectors.length; sx++) {
      for (let sy = 0; sy < partition.sectors[0].length; sy++) {
        for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
          // Only save if the sector is loaded.
          // TODO: There's gotta be a nasty race condition here.
          if (partition.sectors[sx][sy][sz]) {
            promises.push(this.saveSector({w, x: sx, y: sy, z: sz}));
          }
        }
      }
    }
    await Promise.all(promises);
  }

  protected metaPath() {
    return 'meta.json';
  }

  protected miscPath(name: string) {
    return path.join(this.miscDir, name);
  }

  protected partitionPath(w: number) {
    return path.join(this.sectorDir, `${w}`);
  }

  protected partitionMetaPath(w: number) {
    return path.join(this.partitionPath(w), 'meta.json');
  }

  protected sectorPath(sectorPoint: TilePoint) {
    return path.join(this.partitionPath(sectorPoint.w), `${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}.json`);
  }

  protected creaturesPath() {
    return 'creatures.json';
  }

  protected containerPath(id: string) {
    return path.join(this.containerDir, `${id}.json`);
  }

  protected playerPath(id: string) {
    return path.join(this.playerDir, `${id}.json`);
  }

  protected accountPath(username: string) {
    return path.join(this.accountDir, `${username}.json`);
  }
}
