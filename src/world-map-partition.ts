import { SECTOR_SIZE } from './constants';
import * as Content from './content';
import { matrix, worldToSector } from './utils';

class WorldMapPartition {
  public width: number;
  public height: number;
  public depth: number;
  public sectors: Array<Array<Array<Sector | null>>>; // (Sector | null)[][][]
  public loader: (sectorPoint: PartitionPoint) => Promise<Sector>;
  private _sectorLoadPromises = new Map<string, Promise<Sector>>();

  constructor(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.sectors = matrix(width / SECTOR_SIZE, height / SECTOR_SIZE, depth);
  }

  // TODO - can this be removed?
  public init(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.sectors = matrix(width / SECTOR_SIZE, height / SECTOR_SIZE, depth);
  }

  public inBounds(point: PartitionPoint): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height &&
      point.z >= 0 && point.z < this.depth;
  }

  public walkable(point: PartitionPoint): boolean {
    if (!this.inBounds(point)) return false;

    const tile = this.getTile(point);
    if (tile.creature) return false;
    if (tile.item && !Content.getMetaItem(tile.item.type).walkable) return false;

    return true;
  }

  public getSector(sectorPoint: PartitionPoint): Sector {
    let sector: Sector | null = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z];
    if (!sector) {
      // Sector loading must be async, but querying sector data is always sync.
      // Return an empty, unwalkable sector while the real sector is loaded.
      sector = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z] = this.createEmptySector();
      this._loadSector(sectorPoint);
    }
    return sector;
  }

  // Waits for real sector to load, if not loaded yet.
  public async getSectorAsync(sectorPoint: PartitionPoint) {
    const key = JSON.stringify(sectorPoint);
    const sectorPromise = this._sectorLoadPromises.get(key);
    // debugger;
    if (sectorPromise) return sectorPromise;

    const sector: Sector | null = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z];
    if (sector) return sector;

    return this._loadSector(sectorPoint);
  }

  public getTile(point: PartitionPoint): Tile {
    if (!this.inBounds(point)) return { floor: 0 };

    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    return sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE];
  }

  public setTile(point: PartitionPoint, tile: Tile) {
    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE] = tile;
  }

  public getItem(point: PartitionPoint) {
    return this.getTile(point).item;
  }

  public createEmptySector() {
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

  private _loadSector(sectorPoint: PartitionPoint) {
    const key = JSON.stringify(sectorPoint);
    const sectorLoadPromise = this.loader(sectorPoint).then((tiles) => {
      this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z] = tiles;
      this._sectorLoadPromises.delete(key);
      return tiles;
    });
    this._sectorLoadPromises.set(key, sectorLoadPromise);
    return sectorLoadPromise;
  }
}

export default WorldMapPartition;
