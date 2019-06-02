import { SECTOR_SIZE } from './constants';
import * as Content from './content';
import { matrix, worldToSector } from './utils';

export default class WorldMap {
  public width: number;
  public height: number;
  public depth: number;
  public sectors: Array<Array<Array<Sector | null>>>; // (Sector | null)[][][]
  public loader: (sectorPoint: TilePoint) => Sector;

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

  public inBounds(point: TilePoint): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height &&
      point.z >= 0 && point.z < this.depth;
  }

  public walkable(point: TilePoint): boolean {
    if (!this.inBounds(point)) return false;

    const tile = this.getTile(point);
    if (tile.creature) return false;
    if (tile.item && !Content.getMetaItem(tile.item.type).walkable) return false;

    return true;
  }

  public getSector(sectorPoint: TilePoint): Sector {
    let sector: Sector | null = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z];
    if (!sector) {
      sector = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z] = this.loader(sectorPoint);
    }
    return sector;
  }

  public getTile(point: TilePoint): Tile {
    if (!this.inBounds(point)) return { floor: 0 };

    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    return sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE];
  }

  public setTile(point: TilePoint, tile: Tile) {
    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE] = tile;
  }

  public getItem(point: TilePoint) {
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
}

/* tslint:disable-next-line */
// export class ClientWorldMap extends WorldMap {
//   constructor(width: number, height: number, depth: number, private wire: ClientToServerWire) {
//     super(width, height, depth);
//   }

//   public load(point: TilePoint): Sector {
//     this.wire.send('requestSector', point);
//     return this.createEmptySector(); // temporary until server sends something
//   }
// }

// export class ServerWorldMap extends WorldMap {
//   public load(point: TilePoint): Sector {
//     this.wire.send('requestSector', point);
//     return this.createEmptySector(); // temporary until server sends something
//   }
// }
