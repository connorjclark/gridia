import * as fsSync from 'fs';
import * as path from 'path';
import { SECTOR_SIZE } from '../constants';
import Container from '../container';
import { Context } from '../context';
import * as fs from '../iso-fs';
import Player from '../player';
import { equalPoints, worldToSector } from '../utils';
import WorldMap from '../world-map';
import Server from './server';

export class ServerContext extends Context {
  public static async load(serverDir: string) {
    const meta = JSON.parse(await fs.readFile(path.join(serverDir, 'meta.json'), 'utf-8'));
    const map = new WorldMap(meta.width, meta.height, meta.depth);
    const context = new ServerContext(map);
    context.setServerDir(serverDir);

    const creatures = JSON.parse(await fs.readFile(context.creaturesPath(), 'utf-8'));
    for (const creature of creatures) {
      context.creatures.set(creature.id, creature);
      // Purposefully do not set creature on tile, as that would load the sector.
    }

    context.nextContainerId = meta.nextContainerId;
    context.nextCreatureId = meta.nextCreatureId;
    context.nextPlayerId = meta.nextPlayerId;

    return context;
  }

  public nextContainerId = 1;
  public nextCreatureId = 1;
  public nextPlayerId = 1;

  public serverDir: string;
  public containerDir: string;
  public playerDir: string;
  public sectorDir: string;

  public setServerDir(serverDir: string) {
    this.serverDir = serverDir;
    this.containerDir = path.join(serverDir, 'containers');
    this.playerDir = path.join(serverDir, 'players');
    this.sectorDir = path.join(serverDir, 'sectors');
  }

  public loadSector(server: Server, sectorPoint: TilePoint): Sector {
    const sector: Sector = JSON.parse(fsSync.readFileSync(this.sectorPath(sectorPoint), 'utf-8'));

    // Set creatures (all of which are always loaded in memory) to the sector (of which only active areas are loaded).
    // Kinda lame, I guess.
    // Run on next tick, so that loadSector is not called recursively.
    setImmediate(() => {
      for (const creature of this.creatures.values()) {
        if (equalPoints(sectorPoint, worldToSector(creature.pos, SECTOR_SIZE))) {
          server.registerCreature(creature);
        }
      }
    });

    return sector;
  }

  public async saveSector(sectorPoint: TilePoint) {
    const sector = this.map.getSector(sectorPoint);
    // Don't save creatures.
    const data = sector.map((tiles) => tiles.map((tile) => {
      return {floor: tile.floor, item: tile.item};
    }));
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(this.sectorPath(sectorPoint), json);
  }

  public async savePlayer(player: Player) {
    const data = {
      id: player.id,
      creature: player.creature,
      skills: [...player.skills.entries()],
    };
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(this.playerPath(player.id), json);
  }

  public makeContainer() {
    const container = new Container(this.nextContainerId++, Array(10).fill(null));
    this.containers.set(container.id, container);
    return container;
  }

  public getContainerIdFromItem(item: Item) {
    if (item.containerId) {
      return item.containerId;
    } else {
      return item.containerId = this.makeContainer().id;
    }
  }

  // TODO defer to loader like sector is?
  public getContainer(id: number) {
    let container = this.containers.get(id);
    if (container) return container;

    // TODO handle error.
    container = JSON.parse(fsSync.readFileSync(this.containerPath(id), 'utf-8')) as Container;
    this.containers.set(id, container);
    return container;
  }

  public async save() {
    await fs.mkdir(this.containerDir, {recursive: true});
    await fs.mkdir(this.playerDir, {recursive: true});
    await fs.mkdir(this.sectorDir, {recursive: true});

    const meta = {
      width: this.map.width,
      height: this.map.height,
      depth: this.map.depth,
      nextContainerId: this.nextContainerId,
      nextCreatureId: this.nextCreatureId,
      nextPlayerId: this.nextPlayerId,
    };
    await fs.writeFile(this.metaPath(), JSON.stringify(meta, null, 2));

    for (let sx = 0; sx < this.map.sectors.length; sx++) {
      for (let sy = 0; sy < this.map.sectors[0].length; sy++) {
        for (let sz = 0; sz < this.map.sectors[0][0].length; sz++) {
          await this.saveSector({x: sx, y: sy, z: sz});
        }
      }
    }

    for (const container of this.containers.values()) {
      const json = JSON.stringify(container.items, null, 2);
      await fs.writeFile(this.containerPath(container.id), json);
    }

    // Player creatures are transient (new creature made for each login), so don't bother saving them.
    const npcs = [...this.creatures.values()].filter((c) => !c.isPlayer);
    await fs.writeFile(this.creaturesPath(), JSON.stringify(npcs, null, 2));
  }

  protected metaPath() {
    return path.join(this.serverDir, 'meta.json');
  }

  protected creaturesPath() {
    return path.join(this.serverDir, 'creatures.json');
  }

  protected sectorPath(sectorPoint: TilePoint) {
    return path.join(this.sectorDir, `${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}.json`);
  }

  protected containerPath(id: number) {
    return path.join(this.containerDir, `${id}.json`);
  }

  protected playerPath(id: number) {
    return path.join(this.playerDir, `${id}.json`);
  }
}
