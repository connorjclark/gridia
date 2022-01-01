import * as Content from '../content.js';
import {Context} from '../context.js';
import {Database} from '../database.js';
import * as WireSerializer from '../lib/wire-serializer.js';
import * as Utils from '../utils.js';
import {WorldMapPartition} from '../world-map-partition.js';
import {WorldMap} from '../world-map.js';

import {ClientConnection} from './client-connection.js';
import {ScriptConfigStore} from './scripts/script-config-store.js';

async function readJson(fs: Database, store: string, key: string) {
  const json = await fs.get(store, key);

  try {
    return WireSerializer.deserialize(json);
  } catch {
    throw new Error(`cannot parse json at ${store}:${key} – got: ${json}`);
  }
}

export const Store = {
  account: 'account',
  misc: 'misc',
  player: 'player',
  sector: 'sector',
};

export class ServerContext extends Context {
  clientConnections: ClientConnection[] = [];
  players = new Map<string, Player>();
  playerNamesToIds = new Map<string, string>();
  claims: Record<string, string> = {};
  nextCreatureId = 1;
  scriptConfigStore = new ScriptConfigStore({});

  constructor(worldDataDefinition: WorldDataDefinition, map: WorldMap, public db: Database) {
    super(worldDataDefinition, map);
  }

  static async load(db: Database) {
    const meta: Meta = {
      nextCreatureId: 0,
      worldDataDefinition: Content.WORLD_DATA_DEFINITIONS.rpgwo,
      time: 0,
      ...await readJson(db, Store.misc, 'meta.json'),
    };

    // Update stale world definitions with valid values.
    // TODO: eventually delete this when world data definitions are not
    // just carbon-copies of values from WORLD_DATA_DEFINITIONS.
    {
      const canonical = Object.values(Content.WORLD_DATA_DEFINITIONS)
        .find((d) => d.baseDir === meta.worldDataDefinition.baseDir);
      if (canonical) meta.worldDataDefinition = canonical;
    }

    await Content.initializeWorldData(meta.worldDataDefinition);

    const map = new WorldMap();
    const context = new ServerContext(meta.worldDataDefinition, map, db);

    // TODO: figure out if I want to save creatures at all.
    // const creatures = JSON.parse(await fs.readFile(context.creaturesPath()));
    // for (const creature of creatures) {
    //   context.creatures.set(creature.id, creature);
    //   // Purposefully do not set creature on tile, as that would load the sector.
    // }

    context.nextCreatureId = meta.nextCreatureId || 1;
    context.time.epoch = meta.time;

    // Just load all the partitions for now.
    const partitionIds = (await db.getAllKeysInStore(Store.sector))
      .filter((k) => /^\d+\/meta\.json/.test(k))
      .map((key) => parseInt(key));
    for (const w of partitionIds) {
      await context.loadPartition(w);
    }

    context.playerNamesToIds.clear();
    for (const key of await db.getAllKeysInStore(Store.player)) {
      const player: Player = await readJson(db, Store.player, key);
      context.playerNamesToIds.set(player.name, player.id);
    }

    const scriptConfigKey = 'script-config.json';
    if (await db.exists(Store.misc, scriptConfigKey)) {
      context.scriptConfigStore = new ScriptConfigStore(await readJson(db, Store.misc, scriptConfigKey));
    } else {
      context.scriptConfigStore = new ScriptConfigStore({});
    }

    return context;
  }

  async loadSectorClaims(): Promise<Record<string, string>> {
    const key = 'claims.json';
    if (await this.db.exists(Store.misc, key)) return readJson(this.db, Store.misc, key);
    return {};
  }

  saveSectorClaims() {
    const key = 'claims.json';
    this.db.addToTransaction(Store.misc, key, JSON.stringify(this.claims));
  }

  async loadPartition(w: number) {
    const key = `${w}/meta.json`;
    const partitionMeta = await readJson(this.db, Store.sector, key);
    this.map.initPartition(partitionMeta.name, w, partitionMeta.width, partitionMeta.height, partitionMeta.depth);
  }

  async loadSector(sectorPoint: TilePoint) {
    // TODO ???
    const sector = await readJson(this.db, Store.sector, this.sectorKey(sectorPoint)) as Sector;

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

  saveSector(sectorPoint: TilePoint) {
    const sector = this.map.getSector(sectorPoint);
    const json = JSON.stringify(sector, null, 2);
    this.db.addToTransaction(Store.sector, this.sectorKey(sectorPoint), json);
  }

  accountExists(username: string) {
    return this.db.exists(Store.account, this.jsonKey(username));
  }

  async loadAccount(username: string): Promise<GridiaAccount> {
    return readJson(this.db, Store.account, this.jsonKey(username));
  }

  async saveAccount(account: GridiaAccount) {
    const json = WireSerializer.serialize(account);
    await this.db.put(Store.account, this.jsonKey(account.id), json);
  }

  savePlayer(player: Player, creature?: Creature) {
    if (creature) {
      player.pos = creature.pos;
      player.life = creature.life.current;
      player.stamina = creature.stamina.current;
      player.mana = creature.mana.current;
      player.buffs = creature.buffs;
    }

    const json = WireSerializer.serialize(player);
    this.db.addToTransaction(Store.player, this.jsonKey(player.id), json);

    const container = this.containers.get(player.containerId);
    if (container) this.saveContainer(container);

    const equipment = this.containers.get(player.equipmentContainerId);
    if (equipment) this.saveContainer(equipment);
  }

  async loadPlayer(playerId: string) {
    const player: Player = await readJson(this.db, Store.player, this.jsonKey(playerId));
    return player;
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

  saveContainer(container: Container) {
    const json = JSON.stringify({type: container.type, items: container.items}, null, 2);
    this.db.addToTransaction('container', this.jsonKey(container.id), json);
  }

  // TODO defer to loader like sector is?
  async getContainer(id: string) {
    let container = this.containers.get(id);
    if (container) return container;

    // TODO handle error.
    const data = await readJson(this.db, 'container', this.jsonKey(id)) as {
      type: Container['type'];
      items: Array<Item | null>;
    };
    container = {id, type: data.type, items: data.items};
    this.containers.set(id, container);
    return container;
  }

  async getPlayer(id: string) {
    return this.players.get(id) || await this.loadPlayer(id);
  }

  async save() {
    this.saveMeta();
    this.saveSectorClaims();

    for (const clientConnection of this.clientConnections) {
      if (clientConnection.player) {
        this.savePlayer(clientConnection.player, clientConnection.creature);
      }
    }

    for (const [w, partition] of this.map.getPartitions()) {
      this.savePartition(w, partition);
    }

    for (const container of this.containers.values()) {
      this.saveContainer(container);
    }

    // TODO: eventually want to save _some_ creatures (like tamed creatures).

    await this.db.endTransaction();

    for (const player of this.players.values()) {
      if (!player.loggedIn) this.players.delete(player.id);
    }
  }

  protected saveMeta() {
    const meta: Meta = {
      nextCreatureId: this.nextCreatureId,
      worldDataDefinition: this.worldDataDefinition,
      time: this.time.epoch,
    };
    this.db.addToTransaction(Store.misc, 'meta.json', JSON.stringify(meta, null, 2));
  }

  protected savePartition(w: number, partition: WorldMapPartition) {
    const meta = partition.getMeta();
    this.db.addToTransaction(Store.sector, `${w}/meta.json`, JSON.stringify(meta, null, 2));

    for (let sx = 0; sx < partition.sectors.length; sx++) {
      for (let sy = 0; sy < partition.sectors[0].length; sy++) {
        for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
          // Only save if the sector is loaded.
          if (partition.sectors[sx][sy][sz]) {
            this.saveSector({w, x: sx, y: sy, z: sz});
          }
        }
      }
    }
  }

  protected sectorKey({w, x, y, z}: TilePoint) {
    return `${w}/${x},${y},${z}.json`;
  }

  // TODO: delete?
  protected jsonKey(name: string|number) {
    return `${name}.json`;
  }
}
