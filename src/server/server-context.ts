import * as path from 'path';
import Container, { ContainerType } from '../container';
import { Context } from '../context';
import * as fs from '../iso-fs';
import Player from '../player';
import WorldMap from '../world-map';
import WorldMapPartition from '../world-map-partition';
import * as WireSerializer from '../lib/wire-serializer';
import Server from './server';

async function readJson(filePath: string) {
  const json = await fs.readFile(filePath);

  try {
    return JSON.parse(json);
  } catch (_) {
    throw new Error(`cannot parse json at ${filePath}: ${json}`);
  }
}

export class ServerContext extends Context {
  nextAccountId = 1;
  nextContainerId = 1;
  nextCreatureId = 1;
  nextPlayerId = 1;
  accountNamesToIds = new Map<string, number>();
  playerNamesToIds = new Map<string, number>();

  accountDir: string;
  containerDir: string;
  miscDir: string;
  playerDir: string;
  sectorDir: string;

  constructor(map: WorldMap) {
    super(map);
    this.accountDir = 'accounts';
    this.containerDir = 'containers';
    this.miscDir = 'misc';
    this.playerDir = 'players';
    this.sectorDir = 'sectors';
  }

  static async load() {
    const map = new WorldMap();
    const context = new ServerContext(map);

    await fs.mkdir(context.accountDir, { recursive: true });
    await fs.mkdir(context.containerDir, { recursive: true });
    await fs.mkdir(context.miscDir, { recursive: true });
    await fs.mkdir(context.playerDir, { recursive: true });
    await fs.mkdir(context.sectorDir, { recursive: true });

    const meta = await readJson(context.metaPath());

    // TODO: figure out if I want to save creatures at all.
    // const creatures = JSON.parse(await fs.readFile(context.creaturesPath()));
    // for (const creature of creatures) {
    //   context.creatures.set(creature.id, creature);
    //   // Purposefully do not set creature on tile, as that would load the sector.
    // }

    context.nextAccountId = meta.nextAccountId || 1;
    context.nextContainerId = meta.nextContainerId || 1;
    context.nextCreatureId = meta.nextCreatureId || 1;
    context.nextPlayerId = meta.nextPlayerId || 1;

    // Just load all the partitions for now.
    const partitionIds = (await fs.readdir(context.sectorDir)).map(Number);
    for (const w of partitionIds) {
      await context.loadPartition(w);
    }

    context.accountNamesToIds.clear();
    for (const accountPath of await fs.readdir(context.accountDir)) {
      // TODO: different dir.
      if (accountPath.includes('password')) continue;

      const json = await readJson(context.accountDir + '/' + accountPath);
      const account: GridiaAccount = WireSerializer.deserialize(json);
      context.accountNamesToIds.set(account.name, account.id);
    }

    context.playerNamesToIds.clear();
    for (const playerPath of await fs.readdir(context.playerDir)) {
      const json = await readJson(context.playerDir + '/' + playerPath);
      const player: Player = WireSerializer.deserialize(json);
      context.playerNamesToIds.set(player.name, player.id);
    }

    return context;
  }

  async loadPartition(w: number) {
    const partitionPath = this.partitionMetaPath(w);
    const partitionMeta = await readJson(partitionPath);
    this.map.initPartition(w, partitionMeta.width, partitionMeta.height, partitionMeta.depth);
  }

  async loadSector(server: Server, sectorPoint: TilePoint) {
    const sector = await readJson(this.sectorPath(sectorPoint)) as Sector;

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
    const data = sector.map((tiles) => tiles.map((tile) => ({ floor: tile.floor, item: tile.item })));
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(this.sectorPath(sectorPoint), json);
  }

  async loadAccount(id: number): Promise<GridiaAccount> {
    const json = await fs.readFile(this.accountPath(id));
    return WireSerializer.deserialize(json);
  }

  async saveAccount(account: GridiaAccount) {
    const json = WireSerializer.serialize(account);
    await fs.writeFile(this.accountPath(account.id), json);
  }

  async saveAccountPassword(id: number, password: string) {
    // TODO salt n' pepper.
    await fs.writeFile(this.accountPasswordPath(id), password);
  }

  async checkAccountPassword(id: number, password: string) {
    const pswd = await fs.readFile(this.accountPasswordPath(id));
    return pswd === password;
  }

  async savePlayer(player: Player) {
    const json = WireSerializer.serialize(player);
    await fs.writeFile(this.playerPath(player.id), json);

    const container = this.containers.get(player.containerId);
    if (container) await this.saveContainer(container);

    const equipment = this.containers.get(player.equipmentContainerId);
    if (equipment) await this.saveContainer(equipment);
  }

  async loadPlayer(playerId: number): Promise<Player> {
    const json = await fs.readFile(this.playerPath(playerId));
    return WireSerializer.deserialize(json);
  }

  makeContainer(type: ContainerType, size = 30) {
    const container = new Container(type, this.nextContainerId++, Array(size).fill(null));
    this.containers.set(container.id, container);
    return container;
  }

  getContainerIdFromItem(item: Item) {
    if (item.containerId) {
      return item.containerId;
    } else {
      return item.containerId = this.makeContainer(ContainerType.Normal, 10).id;
    }
  }

  async saveContainer(container: Container) {
    const json = JSON.stringify({ type: container.type, items: container.items }, null, 2);
    await fs.writeFile(this.containerPath(container.id), json);
  }

  // TODO defer to loader like sector is?
  async getContainer(id: number) {
    let container = this.containers.get(id);
    if (container) return container;

    // TODO handle error.
    // (following todo may not be valid anymore)
    // TODO: even tho fs is stubbed in the browser build, parcel sees `readFileSync` and insists
    // that this be statically analyzable so it can do its bundling. Should create an interface that
    // doesn't trip up parcel's grepping for `.readFile`... (loadData?)
    const data = await readJson(this.containerPath(id)) as {
      type: ContainerType;
      items: Array<Item | null>;
    };
    container = new Container(data.type, id, data.items);
    this.containers.set(id, container);
    return container;
  }

  async save() {
    await fs.mkdir(this.accountDir, { recursive: true });
    await fs.mkdir(this.containerDir, { recursive: true });
    await fs.mkdir(this.miscDir, { recursive: true });
    await fs.mkdir(this.playerDir, { recursive: true });
    await fs.mkdir(this.sectorDir, { recursive: true });

    await this.saveMeta();

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
      nextAccountId: this.nextAccountId,
      nextContainerId: this.nextContainerId,
      nextCreatureId: this.nextCreatureId,
      nextPlayerId: this.nextPlayerId,
    };
    await fs.writeFile(this.metaPath(), JSON.stringify(meta, null, 2));
  }

  protected async savePartition(w: number, partition: WorldMapPartition) {
    await fs.mkdir(this.partitionPath(w), { recursive: true });

    const meta = {
      width: partition.width,
      height: partition.height,
      depth: partition.depth,
    };
    await fs.writeFile(this.partitionMetaPath(w), JSON.stringify(meta, null, 2));

    const promises = [];
    for (let sx = 0; sx < partition.sectors.length; sx++) {
      for (let sy = 0; sy < partition.sectors[0].length; sy++) {
        for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
          // Only save if the sector is loaded.
          // TODO: There's gotta be a nasty race condition here.
          if (partition.sectors[sx][sy][sz]) {
            promises.push(this.saveSector({ w, x: sx, y: sy, z: sz }));
          }
        }
      }
    }
    await Promise.all(promises);
  }

  protected metaPath() {
    return 'meta.json';
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

  protected containerPath(id: number) {
    return path.join(this.containerDir, `${id}.json`);
  }

  protected playerPath(id: number) {
    return path.join(this.playerDir, `${id}.json`);
  }

  protected accountPath(id: number) {
    return path.join(this.accountDir, `${id}.json`);
  }

  protected accountPasswordPath(id: number) {
    return path.join(this.accountDir, `${id}-password.json`);
  }
}
