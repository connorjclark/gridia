import * as Content from '../content.js';
import {Database} from '../database.js';
import * as WireSerializer from '../lib/wire-serializer.js';
import {WorldMapPartition} from '../world-map-partition.js';
import {WorldMap} from '../world-map.js';

import {ServerContext} from './server-context.js';

async function readJson<T>(fs: Database, store: string, key: string) {
  const json = await fs.get(store, key);

  try {
    return WireSerializer.deserialize<T>(json);
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

const scriptConfigKey = 'script-config.json';
const sectorClaimsKey = 'claims.json';

export async function loadServerContext(db: Database): Promise<ServerContext> {
  const meta: Meta = {
    nextCreatureId: 0,
    worldDataDefinition: Content.WORLD_DATA_DEFINITIONS.rpgwo,
    time: 0,
    ...await readJson<Partial<Meta>>(db, Store.misc, 'meta.json'),
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
    await loadPartition(context, w);
  }

  context.playerNamesToIds.clear();
  for (const key of await db.getAllKeysInStore(Store.player)) {
    const player = await readJson<Player>(db, Store.player, key);
    context.playerNamesToIds.set(player.name, player.id);
  }

  if (await db.exists(Store.misc, scriptConfigKey)) {
    context.scriptConfigStore = await readJson(db, Store.misc, scriptConfigKey);
  } else {
    context.scriptConfigStore = {};
  }

  return context;
}

export async function saveServerContext(context: ServerContext) {
  saveMeta(context);
  saveSectorClaims(context);
  context.db.addToTransaction(Store.misc, scriptConfigKey, JSON.stringify(context.scriptConfigStore, null, 2));

  for (const clientConnection of context.clientConnections) {
    if (clientConnection.player) {
      savePlayer(context, clientConnection.player, clientConnection.creature);
    }
  }

  for (const [w, partition] of context.map.getPartitions()) {
    savePartition(context, w, partition);
  }

  for (const container of context.containers.values()) {
    saveContainer(context, container);
  }

  // TODO: eventually want to save _some_ creatures (like tamed creatures).

  await context.db.endTransaction();

  for (const player of context.players.values()) {
    if (!player.loggedIn) context.players.delete(player.id);
  }
}

export async function loadSectorClaims(context: ServerContext): Promise<Record<string, string>> {
  if (await context.db.exists(Store.misc, sectorClaimsKey)) return readJson(context.db, Store.misc, sectorClaimsKey);
  return {};
}

export function saveSectorClaims(context: ServerContext) {
  context.db.addToTransaction(Store.misc, sectorClaimsKey, JSON.stringify(context.claims));
}

export async function loadPartition(context: ServerContext, w: number) {
  const key = `${w}/meta.json`;
  const partitionMeta = await readJson<any>(context.db, Store.sector, key);
  context.map.initPartition(partitionMeta.name, w, partitionMeta.width, partitionMeta.height, partitionMeta.depth);
}

export async function loadSector(context: ServerContext, sectorPoint: TilePoint) {
  // TODO ???
  const sector = await readJson<Sector>(context.db, Store.sector, sectorKey(sectorPoint));

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

export function saveSector(context: ServerContext, sectorPoint: TilePoint) {
  const sector = context.map.getSector(sectorPoint);
  const json = JSON.stringify(sector, null, 2);
  context.db.addToTransaction(Store.sector, sectorKey(sectorPoint), json);
}

// accountExists(username: string) {
//   return this.db.exists(Store.account, this.jsonKey(username));
// }

export async function loadAccount(context: ServerContext, username: string): Promise<GridiaAccount> {
  return readJson<GridiaAccount>(context.db, Store.account, jsonKey(username));
}

export async function saveAccount(context: ServerContext, account: GridiaAccount) {
  const json = WireSerializer.serialize(account);
  await context.db.put(Store.account, jsonKey(account.id), json);
}

export function accountExists(context: ServerContext, username: string) {
  return context.db.exists(Store.account, jsonKey(username));
}

export function savePlayer(context: ServerContext, player: Player, creature?: Creature) {
  if (creature) {
    player.pos = creature.pos;
    player.life = creature.life.current;
    player.stamina = creature.stamina.current;
    player.mana = creature.mana.current;
    player.buffs = creature.buffs;
  }

  player.lastSaved = Date.now();

  const json = WireSerializer.serialize(player);
  context.db.addToTransaction(Store.player, jsonKey(player.id), json);

  const container = context.containers.get(player.containerId);
  if (container) saveContainer(context, container);

  const equipment = context.containers.get(player.equipmentContainerId);
  if (equipment) saveContainer(context, equipment);
}

export async function loadPlayer(context: ServerContext, playerId: string) {
  const player: Player = await readJson(context.db, Store.player, jsonKey(playerId));
  player.timePlayed = player.timePlayed || 0; // TODO: remove
  player.lastSaved = player.lastSaved || 0; // TODO: remove
  player.specializedSkills = player.specializedSkills || new Set(); // TODO: remove
  player.dialougeSymbols = player.dialougeSymbols || new Map(); // TODO: remove
  return player;
}

// makeContainer(type: Container['type'], size = 30) {
//   let container = {id: Utils.uuid(), type, items: Array(size).fill(null)};
//   container = sniffObject(container, (op) => {
//     if (!this.server) throw new Error('missing this.server');

//     const ops = this.server.pendingContainerSniffedOperations.get(container) || [];
//     ops.push(op);
//     this.server.pendingContainerSniffedOperations.set(container, ops);
//   });
//   this.containers.set(container.id, container);
//   return container;
// }

// getContainerIdFromItem(item: Item) {
//   if (!item.containerId) {
//     item.containerId = this.makeContainer('normal', 10).id;
//   }

//   return item.containerId;
// }

export function saveContainer(context: ServerContext, container: Container) {
  const json = JSON.stringify({type: container.type, items: container.items}, null, 2);
  context.db.addToTransaction('container', jsonKey(container.id), json);
}

// TODO defer to loader like sector is?
export async function loadContainer(context: ServerContext, id: string): Promise<Container> {
  // TODO handle error.
  const data = await readJson<any>(context.db, 'container', jsonKey(id)) as {
    type: Container['type'];
    items: Array<Item | null>;
  };

  return {id, type: data.type, items: data.items};
}

// async getPlayer(id: string) {
//   return this.players.get(id) || await this.loadPlayer(id);
// }

// async save() {
//   this.saveMeta();
//   this.saveSectorClaims();
//   this.db.addToTransaction(Store.misc, scriptConfigKey, JSON.stringify(this.scriptConfigStore, null, 2));

//   for (const clientConnection of this.clientConnections) {
//     if (clientConnection.player) {
//       this.savePlayer(clientConnection.player, clientConnection.creature);
//     }
//   }

//   for (const [w, partition] of this.map.getPartitions()) {
//     this.savePartition(w, partition);
//   }

//   for (const container of this.containers.values()) {
//     this.saveContainer(container);
//   }

//   // TODO: eventually want to save _some_ creatures (like tamed creatures).

//   await this.db.endTransaction();

//   for (const player of this.players.values()) {
//     if (!player.loggedIn) this.players.delete(player.id);
//   }
// }

export function saveMeta(context: ServerContext) {
  const meta: Meta = {
    nextCreatureId: context.nextCreatureId,
    worldDataDefinition: context.worldDataDefinition,
    time: context.time.epoch,
  };
  context.db.addToTransaction(Store.misc, 'meta.json', JSON.stringify(meta, null, 2));
}

export function savePartition(context: ServerContext, w: number, partition: WorldMapPartition) {
  const meta = partition.getMeta();
  context.db.addToTransaction(Store.sector, `${w}/meta.json`, JSON.stringify(meta, null, 2));

  for (let sx = 0; sx < partition.sectors.length; sx++) {
    for (let sy = 0; sy < partition.sectors[0].length; sy++) {
      for (let sz = 0; sz < partition.sectors[0][0].length; sz++) {
        // Only save if the sector is loaded.
        if (partition.sectors[sx][sy][sz]) {
          saveSector(context, {w, x: sx, y: sy, z: sz});
        }
      }
    }
  }
}

function sectorKey({w, x, y, z}: TilePoint) {
  return `${w}/${x},${y},${z}.json`;
}

// TODO: delete?
function jsonKey(name: string|number) {
  return `${name}.json`;
}
