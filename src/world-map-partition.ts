import {SECTOR_SIZE} from './constants.js';
import * as Content from './content.js';
import * as Utils from './utils.js';

export class WorldMapPartition {
  name = '';
  // TODO remove?
  loaded = false;
  width: number;
  height: number;
  depth: number;
  sectors: Array3D<Sector | null>;
  loader?: (sectorPoint: PartitionPoint) => Promise<Sector>;
  private _sectorLoadPromises = new Map<string, Promise<Sector>>();

  constructor(name: string, width: number, height: number, depth: number) {
    if (depth < 0 || depth > 20) throw new Error('invalid depth');

    this.name = name;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.sectors = Utils.matrix(width / SECTOR_SIZE, height / SECTOR_SIZE, depth);
  }

  getMeta(): PartitionMeta {
    return {
      name: this.name,
      width: this.width,
      height: this.height,
      depth: this.depth,
    };
  }

  inBounds(pos: PartitionPoint): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x < this.width && pos.y < this.height &&
      pos.z >= 0 && pos.z < this.depth;
  }

  walkable(pos: PartitionPoint): boolean {
    if (!this.inBounds(pos)) return false;

    const tile = this.getTile(pos);
    if (tile.item && Content.getMetaItem(tile.item.type).blocksMovement) return false;

    return true;
  }

  async walkableAsync(pos: PartitionPoint): Promise<boolean> {
    await this.getSectorAsync(Utils.worldToSector(pos, SECTOR_SIZE));
    return this.walkable(pos);
  }

  getSector(sectorPoint: PartitionPoint): Sector {
    let sector = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z];
    if (!sector) {
      // Sector loading must be async, but querying sector data is always sync.
      // Return an empty sector while the real sector is loaded.
      sector = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z] = this.createEmptySector();
      this._loadSector(sectorPoint);
    }
    return sector;
  }

  getSectorIfLoaded(sectorPoint: PartitionPoint): Sector | null {
    return this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z];
  }

  // Waits for real sector to load, if not loaded yet.
  async getSectorAsync(sectorPoint: PartitionPoint) {
    return this._loadSector(sectorPoint);
  }

  getTile(pos: PartitionPoint): Tile {
    if (!this.inBounds(pos)) return {floor: 0};

    const sector = this.getSector(Utils.worldToSector(pos, SECTOR_SIZE));
    return sector[pos.x % SECTOR_SIZE][pos.y % SECTOR_SIZE];
  }

  setTile(pos: PartitionPoint, tile: Tile) {
    const sector = this.getSector(Utils.worldToSector(pos, SECTOR_SIZE));
    sector[pos.x % SECTOR_SIZE][pos.y % SECTOR_SIZE] = tile;
  }

  getItem(pos: PartitionPoint) {
    return this.getTile(pos).item;
  }

  createEmptySector() {
    const tiles: Tile[][] = [];

    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[x] = [];
      for (let y = 0; y < SECTOR_SIZE; y++) {
        tiles[x][y] = {
          floor: 0,
        };
      }
    }

    return tiles;
  }

  *getIteratorForArea(start: Point3, width: number, height: number) {
    start = {
      x: Utils.clamp(start.x, 0, this.width),
      y: Utils.clamp(start.y, 0, this.height),
      z: start.z,
    };
    if (start.x + width >= this.width) width = this.width - start.x;
    if (start.y + height >= this.height) height = this.height - start.y;

    // Do some caching for current sector.
    let currentSector;

    const cur = {...start};
    for (let x = 0; x < width; x++) {
      currentSector = null;
      cur.y = start.y;

      for (let y = 0; y < height; y++) {
        if ((cur.y % SECTOR_SIZE === 0) || (cur.y % SECTOR_SIZE === SECTOR_SIZE - 1)) currentSector = null;

        if (!currentSector) currentSector = this.getSector(Utils.worldToSector(cur, SECTOR_SIZE));
        if (currentSector) {
          yield {pos: cur, tile: currentSector[cur.x % SECTOR_SIZE][cur.y % SECTOR_SIZE]};
        }

        cur.y++;
      }

      cur.x++;
    }
  }

  private _loadSector(sectorPoint: PartitionPoint) {
    if (!this.loader) throw new Error('loader not set');

    const key = JSON.stringify(sectorPoint);
    let sectorLoadPromise = this._sectorLoadPromises.get(key);
    if (sectorLoadPromise) return sectorLoadPromise;

    sectorLoadPromise = this.loader(sectorPoint).then((tiles) => {
      this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z] = tiles;
      return tiles;
    });
    this._sectorLoadPromises.set(key, sectorLoadPromise);
    return sectorLoadPromise;
  }

  private _clear() {
    this.sectors = Utils.matrix(this.width / SECTOR_SIZE, this.height / SECTOR_SIZE, this.depth);
    this._sectorLoadPromises.clear();
  }
}
