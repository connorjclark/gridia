import * as fs from './iso-fs';
import { getMetaItemByName } from './items';
import { ClientToServerProtocol } from './protocol';
import { worldToSector } from './utils';

const SECTOR_SIZE = 20;

function createSector() {
  /** @type {Tile[][]} */
  const tiles = [];

  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[x] = [];
    for (let y = 0; y < SECTOR_SIZE; y++) {
      tiles[x][y] = {
        floor: 0,
        item: null,
      };
    }
  }

  return tiles;
}

function matrix<T>(w: number, h: number, val: T = null): T[][] {
  const m = Array(w);

  for (let i = 0; i < w; i++) {
    m[i] = Array(h);
    for (let j = 0; j < h; j++) {
      m[i][j] = val;
    }
  }

  return m;
}

export abstract class WorldContext {
  public width: number;
  public height: number;
  public sectors: Sector[][];
  public creatures: Record<number, Creature> = {};
  public containers: Map<number, Container> = new Map();

  constructor(width: number, height: number) {
    this.init(width, height);
  }

  public init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.sectors = matrix(width / SECTOR_SIZE, height / SECTOR_SIZE);
  }

  public abstract load(point: Point): Sector;

  public inBounds(point: Point): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height;
  }

  public getSector(sectorPoint: Point): Sector {
    let sector = this.sectors[sectorPoint.x][sectorPoint.y];
    if (!sector) {
      sector = this.sectors[sectorPoint.x][sectorPoint.y] = this.load(sectorPoint);
    }
    return sector;
  }

  public getTile(point: Point): Tile | null {
    if (!this.inBounds(point)) return { floor: 0, item: null };

    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    return sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE];
  }

  public setTile(point: Point, tile: Tile) {
    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE] = tile;
  }

  public getItem(point: Point) {
    return this.getTile(point).item;
  }

  public getCreature(id: number): Creature | void {
    return this.creatures[id];
  }

  public setCreature(creature: Creature) {
    this.creatures[creature.id] = creature;
    this.getTile(creature.pos).creature = creature;
  }
}

export class ClientWorldContext extends WorldContext {
  constructor(private wire: ClientToServerWire) {
    super(0, 0);
  }

  public isInited() {
    return this.width > 0;
  }

  public load(point: Point): Sector {
    this.wire.send('requestSector', point);
    return createSector(); // temporary until server sends something
  }
}

export class ServerWorldContext extends WorldContext {
  public static async load() {
    const meta = JSON.parse(await fs.readFile(`serverdata/meta.json`, 'utf-8'));
    return new ServerWorldContext(meta.width, meta.height);
  }

  public load(point: Point): Sector {
    // TODO load from disk
    return createSector();
    // return createSector(!this.fillWorldWithStuff);
  }

  public async save(sectorPoint: Point) {
    const sector = this.getSector(sectorPoint);
    const sectorPath = `serverdata/${sectorPoint.x},${sectorPoint.y}.json`;
    const data = JSON.stringify(sector, null, 2);
    await fs.writeFile(sectorPath, data);
  }

  public async saveAll() {
    for (let sx = 0; sx < this.sectors.length; sx++) {
      for (let sy = 0; sy < this.sectors[0].length; sy++) {
        await this.save({x: sx, y: sy});
      }
    }

    const meta = {
      width: this.width,
      height: this.height,
    };
    await fs.writeFile(`serverdata/meta.json`, JSON.stringify(meta, null, 2));
  }
}
